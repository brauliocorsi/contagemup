import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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
  status: 'match' | 'surplus' | 'shortage' | 'erp_only' | 'local_only';
  location?: string | null;
}

export function useERPReconciliation() {
  const [erpProducts, setErpProducts] = useState<ERPProduct[]>([]);
  const [comparisonItems, setComparisonItems] = useState<ERPComparisonItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const { toast } = useToast();

  const fetchAllERPProducts = useCallback(async (): Promise<ERPProduct[]> => {
    const allProducts: ERPProduct[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      setProgress(prev => ({ ...prev, current: page }));

      const { data, error } = await supabase.functions.invoke('gestaoclick-products', {
        body: { page },
      });

      if (error) {
        throw new Error(`Erro ao buscar produtos do ERP: ${error.message}`);
      }

      // GestãoClick returns { data: [...products], meta: { total, ... } } or similar
      const products = data?.data || data?.produtos || data || [];
      
      if (Array.isArray(products) && products.length > 0) {
        const mapped = products.map((p: any) => ({
          id: String(p.id),
          codigo_interno: p.codigo_interno || p.codigo || '',
          nome: p.nome || '',
          estoque_atual: parseFloat(p.estoque_atual || p.estoque || '0') || 0,
          grupo: p.grupo?.nome || p.grupo_nome || '',
        }));
        allProducts.push(...mapped);
        page++;
        
        // If less than 100 products returned, we've reached the last page
        if (products.length < 100) {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
    }

    return allProducts;
  }, []);

  const fetchAndCompare = useCallback(async () => {
    setLoading(true);
    setComparisonItems([]);
    setProgress({ current: 0, total: 0 });

    try {
      // 1. Fetch all ERP products
      toast({ title: 'A carregar', description: 'A buscar produtos do GestãoClick...' });
      const erp = await fetchAllERPProducts();
      setErpProducts(erp);

      if (erp.length === 0) {
        toast({
          title: 'Aviso',
          description: 'Nenhum produto encontrado no GestãoClick',
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }

      // 2. Fetch local products
      const { data: localProducts, error: localError } = await supabase
        .from('products')
        .select('code, name, current_stock, damaged_stock, location');

      if (localError) throw localError;

      // 3. Compare by code
      const localMap = new Map(
        (localProducts || []).map(p => [p.code.toLowerCase(), p])
      );
      const erpMap = new Map(
        erp.map(p => [p.codigo_interno.toLowerCase(), p])
      );

      const items: ERPComparisonItem[] = [];
      const processedLocalCodes = new Set<string>();

      // ERP products comparison
      for (const erpProd of erp) {
        const code = erpProd.codigo_interno.toLowerCase();
        const localProd = localMap.get(code);
        processedLocalCodes.add(code);

        const erpStock = Math.round(erpProd.estoque_atual);
        const localStock = localProd ? (localProd.current_stock - (localProd.damaged_stock || 0)) : 0;
        const diff = localStock - erpStock;

        let status: ERPComparisonItem['status'];
        if (!localProd) {
          status = 'erp_only';
        } else if (diff === 0) {
          status = 'match';
        } else if (diff > 0) {
          status = 'surplus';
        } else {
          status = 'shortage';
        }

        items.push({
          productCode: erpProd.codigo_interno,
          productName: erpProd.nome,
          erpStock,
          localStock,
          difference: diff,
          status,
          location: localProd?.location || null,
        });
      }

      // Local-only products (not in ERP)
      for (const [code, localProd] of localMap) {
        if (!processedLocalCodes.has(code) && localProd.current_stock > 0) {
          items.push({
            productCode: localProd.code,
            productName: localProd.name,
            erpStock: 0,
            localStock: localProd.current_stock - (localProd.damaged_stock || 0),
            difference: localProd.current_stock - (localProd.damaged_stock || 0),
            status: 'local_only',
            location: localProd.location,
          });
        }
      }

      // Sort: discrepancies first
      items.sort((a, b) => {
        const order = { shortage: 0, surplus: 1, erp_only: 2, local_only: 3, match: 4 };
        return order[a.status] - order[b.status];
      });

      setComparisonItems(items);

      const discrepancies = items.filter(i => i.status !== 'match').length;
      toast({
        title: 'Conciliação concluída',
        description: `${erp.length} produtos do ERP comparados. ${discrepancies} discrepâncias encontradas.`,
      });
    } catch (err: any) {
      console.error('ERP reconciliation error:', err);
      toast({
        title: 'Erro',
        description: err.message || 'Erro ao fazer conciliação com ERP',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [fetchAllERPProducts, toast]);

  return {
    erpProducts,
    comparisonItems,
    loading,
    progress,
    fetchAndCompare,
  };
}
