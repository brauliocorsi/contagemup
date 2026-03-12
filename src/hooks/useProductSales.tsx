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

export function useProductSales() {
  const [salesMap, setSalesMap] = useState<Record<string, VendaInfo[]>>({});
  const [totalVendas, setTotalVendas] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const fetchSales = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('gestaoclick-vendas', {
        body: {},
      });

      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      setSalesMap(data?.productSalesMap || {});
      setTotalVendas(data?.totalVendas || 0);
      setLoaded(true);
    } catch (err: any) {
      console.error('Error fetching product sales:', err);
      setError(err.message || 'Erro ao buscar vendas');
    } finally {
      setLoading(false);
    }
  }, []);

  const getSalesForProduct = useCallback((productCode: string): VendaInfo[] => {
    return salesMap[productCode] || [];
  }, [salesMap]);

  const hasSales = useCallback((productCode: string): boolean => {
    return (salesMap[productCode]?.length || 0) > 0;
  }, [salesMap]);

  const getSalesCount = useCallback((productCode: string): number => {
    return salesMap[productCode]?.length || 0;
  }, [salesMap]);

  return {
    salesMap,
    totalVendas,
    loading,
    error,
    loaded,
    fetchSales,
    getSalesForProduct,
    hasSales,
    getSalesCount,
  };
}
