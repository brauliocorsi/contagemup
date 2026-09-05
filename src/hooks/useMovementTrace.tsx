import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TraceLine {
  colis_number: number;
  quantity: number;
  location: string | null;
  location_to: string | null;
}

export interface TraceStep {
  id: string;
  created_at: string;
  product_id: string;
  product_code: string;
  product_name: string;
  movement_type: string;
  reason: string | null;
  reference: string | null;
  notes: string | null;
  quantity: number;
  created_by: string | null;
  user_name: string | null;
  reversed: boolean;
  lines: TraceLine[];
  /** rótulo em linguagem simples */
  label: string;
  from: string | null;
  to: string | null;
}

const REASON_LABELS: Record<string, string> = {
  compra: 'Entrada de compra',
  Compra: 'Entrada de compra',
  produção: 'Entrada de produção',
  Produção: 'Entrada de produção',
  arrumacao: 'Arrumado',
  Arrumação: 'Arrumado',
  conferencia: 'Conferência de entrada',
  'Conferência de entrada': 'Conferência de entrada',
  picking_para_doca: 'Separado para o cais',
  carga_para_viatura: 'Carregado na carrinha',
  entrega: 'Entregue',
  Entrega: 'Entregue',
  devolucao: 'Devolvido',
  'Devolução de cliente': 'Devolvido',
  quarentena: 'Movido para quarentena',
  avaria: 'Movido para quarentena',
  Picking: 'Separado',
  Venda: 'Saída para cliente',
  anulação: 'Anulação de movimento',
  transferencia: 'Transferido',
};

export function traceLabel(movementType: string, reason: string | null): string {
  const r = (reason ?? '').trim();
  if (r && REASON_LABELS[r]) return REASON_LABELS[r];
  if (movementType === 'entrada') return r ? `Entrada · ${r}` : 'Entrada';
  if (movementType === 'saida') return r ? `Saída · ${r}` : 'Saída';
  if (movementType === 'transferencia') return r ? `Transferência · ${r}` : 'Transferência';
  return r || movementType;
}

export interface TraceFilters {
  productId?: string | null;
  /** números de encomenda / referências de documento */
  references?: string[];
  from?: string;
  to?: string;
  type?: 'all' | 'entrada' | 'saida' | 'transferencia';
  limit?: number;
}

/** Caminho do produto: linha do tempo a partir de movimentos e respetivas linhas. */
export function useMovementTrace(filters: TraceFilters) {
  const { productId, references, from, to, type = 'all', limit = 300 } = filters;
  const refKey = (references ?? []).join(',');
  const enabled = Boolean(productId) || (references?.length ?? 0) > 0;

  return useQuery({
    queryKey: ['movement-trace', productId ?? '', refKey, from ?? '', to ?? '', type, limit],
    enabled,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<TraceStep[]> => {
      let q = supabase
        .from('stock_movements')
        .select(
          'id, product_id, movement_type, quantity, reason, reference, notes, created_at, created_by, reversed_at, products(code, name)',
        )
        .order('created_at', { ascending: false })
        .limit(limit);
      if (productId) q = q.eq('product_id', productId);
      if (references && references.length > 0) q = q.in('reference', references);
      if (from) q = q.gte('created_at', `${from}T00:00:00`);
      if (to) q = q.lte('created_at', `${to}T23:59:59`);
      if (type !== 'all') q = q.eq('movement_type', type);
      const { data, error } = await q;
      if (error) throw error;

      type Row = {
        id: string;
        product_id: string;
        movement_type: string;
        quantity: number;
        reason: string | null;
        reference: string | null;
        notes: string | null;
        created_at: string;
        created_by: string | null;
        reversed_at: string | null;
        products: { code: string; name: string } | null;
      };
      const rows = (data ?? []) as unknown as Row[];
      if (rows.length === 0) return [];

      const ids = rows.map((r) => r.id);
      const lineMap = new Map<string, TraceLine[]>();
      for (let i = 0; i < ids.length; i += 200) {
        const { data: lines } = await supabase
          .from('stock_movement_lines')
          .select('movement_id, colis_number, quantity, location, location_to')
          .in('movement_id', ids.slice(i, i + 200));
        for (const l of lines ?? []) {
          const arr = lineMap.get(l.movement_id) ?? [];
          arr.push({
            colis_number: l.colis_number,
            quantity: l.quantity,
            location: l.location,
            location_to: l.location_to,
          });
          lineMap.set(l.movement_id, arr);
        }
      }

      const userIds = [...new Set(rows.map((r) => r.created_by).filter(Boolean))] as string[];
      const names = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, name')
          .in('user_id', userIds);
        for (const p of profiles ?? []) names.set(p.user_id, p.name);
      }

      return rows.map((r) => {
        const lines = (lineMap.get(r.id) ?? []).sort((a, b) => a.colis_number - b.colis_number);
        const froms = [...new Set(lines.map((l) => l.location).filter(Boolean))] as string[];
        const tos = [...new Set(lines.map((l) => l.location_to).filter(Boolean))] as string[];
        return {
          id: r.id,
          created_at: r.created_at,
          product_id: r.product_id,
          product_code: r.products?.code ?? '',
          product_name: r.products?.name ?? '',
          movement_type: r.movement_type,
          reason: r.reason,
          reference: r.reference,
          notes: r.notes,
          quantity: r.quantity,
          created_by: r.created_by,
          user_name: r.created_by ? (names.get(r.created_by) ?? null) : null,
          reversed: Boolean(r.reversed_at),
          lines,
          label: traceLabel(r.movement_type, r.reason),
          from: froms.join(', ') || null,
          to: tos.join(', ') || null,
        } satisfies TraceStep;
      });
    },
  });
}
