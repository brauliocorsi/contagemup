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

export function useProductSales() {
  const [salesMap, setSalesMap] = useState<Record<string, VendaInfo[]>>({});
  const [totalVendas, setTotalVendas] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);

  const fetchSales = useCallback(async (skipCache = false) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('gestaoclick-vendas', {
        body: { skipCache },
      });

      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      const rawMap = (data?.productSalesMap || {}) as Record<string, VendaInfo[]>;
      const normalizedMap = Object.entries(rawMap).reduce<Record<string, VendaInfo[]>>((acc, [code, vendas]) => {
        const normalizedCode = normalizeProductCode(String(code || ''));
        if (!normalizedCode) return acc;
        acc[normalizedCode] = Array.isArray(vendas) ? vendas : [];
        return acc;
      }, {});

      setSalesMap(normalizedMap);
      setTotalVendas(data?.totalVendas || 0);
      setCachedAt(data?.cached_at || null);
      setLoaded(true);
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
    fetchSales,
    getSalesForProduct,
    hasSales,
    getSalesCount,
  };
}
