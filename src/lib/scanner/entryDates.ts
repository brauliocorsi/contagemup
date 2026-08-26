import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

/**
 * Data da última entrada de stock (`stock_movements.movement_type = 'entrada'`)
 * por produto. Devolve um mapa `product_id -> ISO date`.
 */
export async function fetchLastEntryDates(productIds: string[]): Promise<Record<string, string>> {
  const ids = Array.from(new Set(productIds.filter(Boolean)));
  const out: Record<string, string> = {};
  if (!ids.length) return out;

  // Consulta em blocos para evitar URLs demasiado longos
  const chunkSize = 100;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    let from = 0;
    const pageSize = 1000;
    // Paginação: pode existir mais de 1000 movimentos para os produtos do bloco
    for (;;) {
      const { data, error } = await supabase
        .from('stock_movements')
        .select('product_id, created_at')
        .eq('movement_type', 'entrada')
        .in('product_id', chunk)
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      (data || []).forEach((m) => {
        const pid = m.product_id as string;
        if (!out[pid] || new Date(m.created_at) > new Date(out[pid])) out[pid] = m.created_at as string;
      });
      if (!data || data.length < pageSize) break;
      from += pageSize;
    }
  }
  return out;
}

/** Hook para obter as datas de última entrada dos produtos indicados */
export function useLastEntryDates(productIds: string[]) {
  const ids = Array.from(new Set(productIds.filter(Boolean))).sort();
  return useQuery({
    queryKey: ['last-entry-dates', ids],
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchLastEntryDates(ids),
  });
}

/** Datas de última entrada a partir de códigos de produto */
export async function fetchLastEntryDatesByCode(codes: string[]): Promise<Record<string, string>> {
  const list = Array.from(new Set(codes.map((c) => (c || '').trim()).filter(Boolean)));
  if (!list.length) return {};
  const { data, error } = await supabase.from('products').select('id, code').in('code', list);
  if (error) throw error;
  const byId = await fetchLastEntryDates((data || []).map((p) => p.id));
  const out: Record<string, string> = {};
  (data || []).forEach((p) => {
    const d = byId[p.id];
    if (d) out[p.code] = d;
  });
  return out;
}
