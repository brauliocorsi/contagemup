import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface VendaInfo {
  venda_id: string;
  codigo: string;
  cliente_nome: string;
  situacao: string;
  data: string;
  valor_total: string;
  produtos: Array<{
    nome: string;
    codigo: string;
    quantidade: string;
    valor_unitario: string;
  }>;
}

export interface ProductSalesData {
  productSalesMap: Record<string, VendaInfo[]>;
  totalVendas: number;
  loading: boolean;
  error: string | null;
  loaded: boolean;
}

const normalizeProductCode = (value: string): string => value.trim().toLowerCase();

function mergeChunkIntoMap(
  target: Record<string, VendaInfo[]>,
  chunk: Record<string, VendaInfo[]>
) {
  for (const [code, vendas] of Object.entries(chunk)) {
    const normalized = normalizeProductCode(code);
    if (!normalized) continue;
    if (!target[normalized]) {
      target[normalized] = [];
    }
    for (const venda of vendas) {
      if (!target[normalized].find(v => v.venda_id === venda.venda_id)) {
        target[normalized].push(venda);
      }
    }
  }
}

export function useProductSales() {
  const [salesMap, setSalesMap] = useState<Record<string, VendaInfo[]>>({});
  const [totalVendas, setTotalVendas] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const fetchSales = useCallback(async (skipCache = false) => {
    setLoading(true);
    setError(null);
    setLoaded(false);
    setSalesMap({});
    setProgress({ current: 0, total: 0 });

    try {
      // Phase 1: Init call
      const { data: initData, error: initError } = await supabase.functions.invoke('gestaoclick-vendas', {
        body: { skipCache, startPage: 0 },
      });

      if (initError) throw initError;
      if (initData?.error) throw new Error(initData.error);

      // If cache hit, return immediately
      if (initData?.cached) {
        const rawMap = (initData.productSalesMap || {}) as Record<string, VendaInfo[]>;
        const normalizedMap: Record<string, VendaInfo[]> = {};
        for (const [code, vendas] of Object.entries(rawMap)) {
          const n = normalizeProductCode(String(code || ''));
          if (n) normalizedMap[n] = Array.isArray(vendas) ? vendas : [];
        }
        setSalesMap(normalizedMap);
        setTotalVendas(initData.totalVendas || 0);
        setCachedAt(initData.cached_at || null);
        setLoaded(true);
        setLoading(false);
        return;
      }

      // Chunked fetching
      const totalPages: number = initData.totalPages || 1;
      const excludedIds: string[] = initData.excludedIds || [];
      const situacaoLookup: Record<string, string> = initData.situacaoLookup || {};

      const aggregatedMap: Record<string, VendaInfo[]> = {};
      let totalVendasCount = 0;

      // Process init chunk (page 1)
      if (initData.chunk?.productSalesMap) {
        mergeChunkIntoMap(aggregatedMap, initData.chunk.productSalesMap);
        totalVendasCount += initData.chunk.vendasCount || 0;
      }

      setProgress({ current: 1, total: totalPages });

      // Fetch remaining pages in chunks
      let nextPage = 2;
      while (nextPage <= totalPages) {
        const { data: chunkData, error: chunkError } = await supabase.functions.invoke('gestaoclick-vendas', {
          body: {
            startPage: nextPage,
            totalPages,
            excludedIds,
            situacaoLookup,
          },
        });

        if (chunkError) throw chunkError;
        if (chunkData?.error) throw new Error(chunkData.error);

        if (chunkData?.chunk?.productSalesMap) {
          mergeChunkIntoMap(aggregatedMap, chunkData.chunk.productSalesMap);
          totalVendasCount += chunkData.chunk.vendasCount || 0;
        }

        const endPage = chunkData?.endPage || nextPage;
        setProgress({ current: endPage, total: totalPages });
        nextPage = endPage + 1;

        if (chunkData?.done) break;
      }

      setSalesMap(aggregatedMap);
      setTotalVendas(totalVendasCount);
      setCachedAt(null);
      setLoaded(true);

      // Save cache via a final call
      try {
        await supabase.functions.invoke('gestaoclick-vendas', {
          body: { startPage: 0, skipCache: false, saveCache: true, productSalesMap: aggregatedMap },
        });
      } catch {
        // Cache save failure is non-critical
      }
    } catch (err: any) {
      console.error('Error fetching product sales:', err);
      setError(err.message || 'Erro ao buscar vendas');
    } finally {
      setLoading(false);
    }
  }, []);

  const getSalesForProduct = useCallback((productCode: string): VendaInfo[] => {
    const normalizedCode = normalizeProductCode(String(productCode || ''));
    if (!normalizedCode) return [];
    return salesMap[normalizedCode] || [];
  }, [salesMap]);

  const hasSales = useCallback((productCode: string): boolean => {
    return getSalesForProduct(productCode).length > 0;
  }, [getSalesForProduct]);

  const getSalesCount = useCallback((productCode: string): number => {
    return getSalesForProduct(productCode).length;
  }, [getSalesForProduct]);

  return {
    salesMap,
    totalVendas,
    loading,
    error,
    loaded,
    cachedAt,
    progress,
    fetchSales,
    getSalesForProduct,
    hasSales,
    getSalesCount,
  };
}
