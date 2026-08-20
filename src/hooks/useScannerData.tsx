import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Product } from '@/types/stock';
import { mapDatabaseError } from '@/lib/errorMessages';

export const CONFERENCE_LOCATION = 'CONF';

export interface ScanCountRow {
  id: string;
  product_id: string;
  colis_number: number;
  quantity: number;
  location: string | null;
  updated_at: string;
}

export interface ProductStockDetail {
  product: Product;
  total: number;
  rows: ScanCountRow[];
  byColis: Record<number, ScanCountRow[]>;
}

/** Procura um produto por código, código de barras, alias ou nome. */
export function useProductResolver() {
  return useCallback(async (rawCode: string): Promise<Product[]> => {
    const code = (rawCode || '').trim();
    if (!code) return [];

    const byCode = await supabase
      .from('products')
      .select('*')
      .ilike('code', code)
      .limit(5);
    if (byCode.data && byCode.data.length > 0) return byCode.data as Product[];

    const byBarcode = await supabase
      .from('products')
      .select('*')
      .eq('barcode', code)
      .limit(5);
    if (byBarcode.data && byBarcode.data.length > 0) return byBarcode.data as Product[];

    const alias = await supabase
      .from('product_barcodes')
      .select('product_id')
      .eq('barcode', code)
      .limit(5);
    if (alias.data && alias.data.length > 0) {
      const ids = alias.data.map((a) => a.product_id);
      const res = await supabase.from('products').select('*').in('id', ids);
      if (res.data && res.data.length > 0) return res.data as Product[];
    }

    const byName = await supabase
      .from('products')
      .select('*')
      .ilike('name', `%${code}%`)
      .limit(10);
    return (byName.data || []) as Product[];
  }, []);
}

export function useProductStockDetail(productId: string | null) {
  return useQuery({
    queryKey: ['scanner-stock', productId],
    enabled: !!productId,
    staleTime: 15 * 1000,
    queryFn: async (): Promise<ProductStockDetail | null> => {
      if (!productId) return null;
      const [{ data: product, error: pErr }, { data: counts, error: cErr }] = await Promise.all([
        supabase.from('products').select('*').eq('id', productId).maybeSingle(),
        supabase
          .from('counts')
          .select('id, product_id, colis_number, quantity, location, updated_at')
          .eq('product_id', productId)
          .order('colis_number', { ascending: true }),
      ]);
      if (pErr) throw pErr;
      if (cErr) throw cErr;
      if (!product) return null;

      const rows = (counts || []) as ScanCountRow[];
      const byColis: Record<number, ScanCountRow[]> = {};
      rows.forEach((r) => {
        byColis[r.colis_number] = byColis[r.colis_number] || [];
        byColis[r.colis_number].push(r);
      });

      return {
        product: product as Product,
        total: rows.reduce((s, r) => s + r.quantity, 0),
        rows,
        byColis,
      };
    },
  });
}

export interface TransferItem {
  count_id: string;
  quantity: number;
  location: string | null;
}

export function useScannerTransfers() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['scanner-stock'] });
    queryClient.invalidateQueries({ queryKey: ['counts'] });
    queryClient.invalidateQueries({ queryKey: ['products'] });
  };

  const transferItems = useMutation({
    mutationFn: async (items: TransferItem[]) => {
      const { data, error } = await supabase.rpc('transfer_stock_location', {
        p_items: items as unknown as never,
      });
      if (error) throw error;
      return data as unknown as { moved: number };
    },
    onSuccess: (data) => {
      invalidate();
      toast.success(`Transferência concluída (${data?.moved ?? 0} registo(s))`);
    },
    onError: (error) => toast.error('Erro na transferência: ' + mapDatabaseError(error)),
  });

  return { transferItems };
}

/** Associa um código de barras lido a um produto (alias). */
export function useLinkBarcode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId, barcode }: { productId: string; barcode: string }) => {
      const { error } = await supabase
        .from('product_barcodes')
        .insert({ product_id: productId, barcode: barcode.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scanner-stock'] });
      toast.success('Código de barras associado ao produto');
    },
    onError: (error) => toast.error('Erro ao associar código: ' + mapDatabaseError(error)),
  });
}
