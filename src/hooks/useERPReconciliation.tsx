import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { mapDatabaseError } from '@/lib/errorMessages';

export interface ERPProduct {
  id: string;
  codigo_interno: string;
  nome: string;
  estoque_atual: number;
  grupo?: string;
}

export interface ERPComparisonItem {
  productCode: string;
  productName: string;
  erpStock: number;
  localStock: number;
  difference: number;
  status: 'match' | 'surplus' | 'shortage' | 'erp_only' | 'local_only' | 'duplicate_suspect';
  location?: string | null;
  possibleMatch?: {
    code: string;
    name: string;
    stock: number;
    source: 'erp' | 'local';
  };
}

export interface SyncValidation {
  isValid: boolean;
  totalProducts: number;
  expectedTotal: number | null;
  pagesFetched: number;
  totalPages: number;
  pagesComplete: boolean;
  failedPages: number[];
  fromCache: boolean;
}

export function useERPReconciliation() {
  const [erpProducts, setErpProducts] = useState<ERPProduct[]>([]);
  const [comparisonItems, setComparisonItems] = useState<ERPComparisonItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [syncValidation, setSyncValidation] = useState<SyncValidation | null>(null);
  const { toast } = useToast();

  const fetchAllERPProducts = useCallback(async (skipCache = false): Promise<ERPProduct[]> => {
    setProgress({ current: 0, total: 1 });

    const { data, error } = await supabase.functions.invoke('gestaoclick-products', {
      body: { fetchAll: true, skipCache },
    });

    if (error) {
      throw new Error(`Erro ao buscar produtos do ERP: ${error.message}`);
    }

    const products = data?.data || [];
    if (data?.meta?.cached_at) {
      setCachedAt(data.meta.cached_at);
    } else {
      setCachedAt(null);
    }

    // Build validation info
    const meta = data?.meta || {};
    const validation: SyncValidation = {
      isValid: meta.pages_complete !== false, // true if complete or not specified (cache)
      totalProducts: products.length,
      expectedTotal: meta.expected_total || null,
      pagesFetched: meta.pages_fetched || 0,
      totalPages: meta.total_paginas || 0,
      pagesComplete: meta.pages_complete !== false,
      failedPages: meta.failed_pages || [],
      fromCache: !!meta.cached,
    };
    setSyncValidation(validation);

    if (!Array.isArray(products) || products.length === 0) {
      return [];
    }

    const mapped = products.map((p: any) => ({
      id: String(p.id),
      codigo_interno: p.codigo_interno || p.codigo || '',
      nome: p.nome || '',
      estoque_atual: parseFloat(String(p.estoque_atual ?? p.estoque ?? '0')) || 0,
      grupo: p.nome_grupo || '',
    }));

    setProgress({ current: 1, total: 1 });
    return mapped;
  }, []);

  const fetchAndCompare = useCallback(async (skipCache = false) => {
    setLoading(true);
    setComparisonItems([]);
    setProgress({ current: 0, total: 0 });
    setSyncValidation(null);

    try {
      toast({ title: 'A carregar', description: 'A buscar produtos do GestãoClick...' });
      const erp = await fetchAllERPProducts(skipCache);
      setErpProducts(erp);

      if (erp.length === 0) {
        toast({ title: 'Aviso', description: 'Nenhum produto encontrado no GestãoClick', variant: 'destructive' });
        setLoading(false);
        return;
      }

      // Fetch ALL local products with pagination to bypass 1000-row limit
      const allLocalProducts: any[] = [];
      let erpFrom = 0;
      const erpPageSize = 1000;
      let erpHasMore = true;
      while (erpHasMore) {
        const { data: batch, error: batchError } = await supabase
          .from('products')
          .select('code, name, current_stock, damaged_stock, location')
          .range(erpFrom, erpFrom + erpPageSize - 1);
        if (batchError) throw batchError;
        if (batch && batch.length > 0) {
          allLocalProducts.push(...batch);
          erpFrom += erpPageSize;
          erpHasMore = batch.length === erpPageSize;
        } else {
          erpHasMore = false;
        }
      }
      const localProducts = allLocalProducts;


      const localMap = new Map((localProducts || []).map(p => [p.code.toLowerCase(), p]));
      const items: ERPComparisonItem[] = [];
      const processedLocalCodes = new Set<string>();

      for (const erpProd of erp) {
        const code = erpProd.codigo_interno.toLowerCase();
        const localProd = localMap.get(code);
        processedLocalCodes.add(code);

        const erpStock = Math.round(erpProd.estoque_atual);
        const localStock = localProd ? (localProd.current_stock - (localProd.damaged_stock || 0)) : 0;
        const diff = localStock - erpStock;

        let status: ERPComparisonItem['status'];
        if (!localProd) status = 'erp_only';
        else if (diff === 0) status = 'match';
        else if (diff > 0) status = 'surplus';
        else status = 'shortage';

        items.push({
          productCode: erpProd.codigo_interno,
          productName: erpProd.nome,
          erpStock, localStock, difference: diff, status,
          location: localProd?.location || null,
        });
      }

      for (const [code, localProd] of localMap) {
        if (!processedLocalCodes.has(code) && localProd.current_stock > 0) {
          items.push({
            productCode: localProd.code, productName: localProd.name,
            erpStock: 0, localStock: localProd.current_stock - (localProd.damaged_stock || 0),
            difference: localProd.current_stock - (localProd.damaged_stock || 0),
            status: 'local_only', location: localProd.location,
          });
        }
      }

      // Duplicate detection by normalized name
      const normalizeName = (n: string) => n.trim().toLowerCase().replace(/\s+/g, ' ');
      
      const erpOnlyItems = items.filter(i => i.status === 'erp_only');
      const localOnlyItems = items.filter(i => i.status === 'local_only');
      
      // Build name lookup for local products (all, not just local_only)
      const localByName = new Map<string, typeof localProducts[0]>();
      for (const lp of (localProducts || [])) {
        localByName.set(normalizeName(lp.name), lp);
      }
      
      // Build name lookup for ERP products
      const erpByName = new Map<string, ERPProduct>();
      for (const ep of erp) {
        erpByName.set(normalizeName(ep.nome), ep);
      }

      // Mark erp_only items that have a name match in local
      for (const item of erpOnlyItems) {
        const normalizedName = normalizeName(item.productName);
        const localMatch = localByName.get(normalizedName);
        if (localMatch && localMatch.code.toLowerCase() !== item.productCode.toLowerCase()) {
          item.status = 'duplicate_suspect';
          item.possibleMatch = {
            code: localMatch.code,
            name: localMatch.name,
            stock: localMatch.current_stock - (localMatch.damaged_stock || 0),
            source: 'local',
          };
        }
      }
      
      // Mark local_only items that have a name match in ERP
      for (const item of localOnlyItems) {
        const normalizedName = normalizeName(item.productName);
        const erpMatch = erpByName.get(normalizedName);
        if (erpMatch && erpMatch.codigo_interno.toLowerCase() !== item.productCode.toLowerCase()) {
          item.status = 'duplicate_suspect';
          item.possibleMatch = {
            code: erpMatch.codigo_interno,
            name: erpMatch.nome,
            stock: Math.round(erpMatch.estoque_atual),
            source: 'erp',
          };
        }
      }

      items.sort((a, b) => {
        const order = { duplicate_suspect: 0, shortage: 1, surplus: 2, erp_only: 3, local_only: 4, match: 5 };
        return order[a.status] - order[b.status];
      });

      setComparisonItems(items);

      const discrepancies = items.filter(i => i.status !== 'match').length;
      toast({ title: 'Conciliação concluída', description: `${erp.length} produtos do ERP comparados. ${discrepancies} discrepâncias encontradas.` });
    } catch (err: any) {
      console.error('ERP reconciliation error:', err);
      toast({ title: 'Erro', description: err.message || 'Erro ao fazer conciliação com ERP', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [fetchAllERPProducts, toast]);

  const searchSingleProduct = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    setComparisonItems([]);

    try {
      const { data, error } = await supabase.functions.invoke('gestaoclick-products', {
        body: { search: searchQuery.trim() },
      });

      if (error) throw new Error(error.message);

      const products = data?.data || [];
      if (products.length === 0) {
        toast({ title: 'Sem resultados', description: `Nenhum produto encontrado para "${searchQuery}"`, variant: 'destructive' });
        setLoading(false);
        return;
      }

      const erp: ERPProduct[] = products.map((p: any) => ({
        id: String(p.id), codigo_interno: p.codigo_interno || p.codigo || '',
        nome: p.nome || '', estoque_atual: parseFloat(String(p.estoque_atual ?? p.estoque ?? '0')) || 0,
        grupo: p.nome_grupo || '',
      }));

      const codes = erp.map(p => p.codigo_interno);
      const { data: localProducts, error: localError } = await supabase
        .from('products')
        .select('code, name, current_stock, damaged_stock, location')
        .in('code', codes);

      if (localError) throw localError;

      const localMap = new Map((localProducts || []).map(p => [p.code.toLowerCase(), p]));

      const items: ERPComparisonItem[] = erp.map(erpProd => {
        const localProd = localMap.get(erpProd.codigo_interno.toLowerCase());
        const erpStock = Math.round(erpProd.estoque_atual);
        const localStock = localProd ? (localProd.current_stock - (localProd.damaged_stock || 0)) : 0;
        const diff = localStock - erpStock;

        let status: ERPComparisonItem['status'];
        if (!localProd) status = 'erp_only';
        else if (diff === 0) status = 'match';
        else if (diff > 0) status = 'surplus';
        else status = 'shortage';

        return { productCode: erpProd.codigo_interno, productName: erpProd.nome, erpStock, localStock, difference: diff, status, location: localProd?.location || null };
      });

      setComparisonItems(items);
      toast({ title: 'Pesquisa concluída', description: `${items.length} produto(s) encontrado(s)` });
    } catch (err: any) {
      console.error('ERP search error:', err);
      toast({ title: 'Erro', description: err.message || 'Erro na pesquisa', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const unifyDuplicate = useCallback(async (item: ERPComparisonItem) => {
    if (!item.possibleMatch) return false;

    // The local product has a different code - update it to match the ERP code
    if (item.possibleMatch.source === 'local') {
      // item.productCode = ERP code, item.possibleMatch.code = local code
      const { error } = await supabase
        .from('products')
        .update({ code: item.productCode })
        .eq('code', item.possibleMatch.code);

      if (error) {
        toast({ title: 'Erro', description: error.message.includes('duplicate') 
          ? 'Já existe um produto com este código no sistema local' 
          : error.message, variant: 'destructive' });
        return false;
      }

      toast({ title: 'Unificado', description: `Código local "${item.possibleMatch.code}" atualizado para "${item.productCode}" (código ERP).` });
    } else {
      // item.productCode = local code, item.possibleMatch.code = ERP code
      const { error } = await supabase
        .from('products')
        .update({ code: item.possibleMatch.code })
        .eq('code', item.productCode);

      if (error) {
        toast({ title: 'Erro', description: error.message.includes('duplicate') 
          ? 'Já existe um produto com este código no sistema local' 
          : error.message, variant: 'destructive' });
        return false;
      }

      toast({ title: 'Unificado', description: `Código local "${item.productCode}" atualizado para "${item.possibleMatch.code}" (código ERP).` });
    }

    // Remove the unified items from the list
    setComparisonItems(prev => prev.filter(i => {
      if (i.productCode === item.productCode && i.status === 'duplicate_suspect') return false;
      if (item.possibleMatch && i.productCode === item.possibleMatch.code && i.status === 'duplicate_suspect') return false;
      return true;
    }));

    return true;
  }, [toast]);

  const registerERPProducts = useCallback(async (items: ERPComparisonItem[], categoryOverride?: string) => {
    if (items.length === 0) return;

    const erpMap = new Map(erpProducts.map(p => [p.codigo_interno.toLowerCase(), p]));

    const productsToInsert = items
      .filter(i => i.status === 'erp_only')
      .map(item => {
        const erpProd = erpMap.get(item.productCode.toLowerCase());
        return {
          code: item.productCode, name: item.productName,
          current_stock: 0, category: categoryOverride || erpProd?.grupo || 'Geral',
          total_colis: 1, min_stock: 0,
        };
      });

    if (productsToInsert.length === 0) return;

    const { error } = await supabase.from('products').insert(productsToInsert);

    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Produtos cadastrados', description: `${productsToInsert.length} produto(s) adicionado(s) ao sistema local.` });

    setComparisonItems(prev =>
      prev.map(item =>
        productsToInsert.some(p => p.code.toLowerCase() === item.productCode.toLowerCase())
          ? { ...item, status: 'shortage' as const, localStock: 0 }
          : item
      )
    );
  }, [erpProducts, toast]);

  return {
    erpProducts, comparisonItems, loading, progress, cachedAt, syncValidation,
    fetchAndCompare, searchSingleProduct, registerERPProducts, unifyDuplicate,
  };
}
