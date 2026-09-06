import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { mapDatabaseError } from '@/lib/errorMessages';
import { useAuth } from '@/hooks/useAuth';

export type AttemptStatus = 'assigned' | 'in_transit' | 'completed' | 'cancelled';
export type AttemptOutcome = 'delivered_full' | 'delivered_partial' | 'not_delivered';

export const ATTEMPT_STATUS_LABELS: Record<AttemptStatus, string> = {
  assigned: 'Atribuída',
  in_transit: 'A caminho',
  completed: 'Concluída',
  cancelled: 'Cancelada',
};

export const OUTCOME_LABELS: Record<AttemptOutcome, string> = {
  delivered_full: 'Entregue por completo',
  delivered_partial: 'Entrega parcial',
  not_delivered: 'Não entregue',
};

/** Motivos de não entrega. `outro` obriga a descrição. */
export const FAILURE_REASONS: { id: string; label: string }[] = [
  { id: 'ausente', label: 'Cliente ausente' },
  { id: 'reagendamento', label: 'Cliente pediu nova data' },
  { id: 'recusa', label: 'Cliente recusou' },
  { id: 'pedido_cancelamento', label: 'Cliente pediu cancelamento' },
  { id: 'avaria', label: 'Artigo danificado' },
  { id: 'outro', label: 'Outro motivo' },
];

export const FAILURE_REASON_LABELS: Record<string, string> = Object.fromEntries(
  FAILURE_REASONS.map((r) => [r.id, r.label]),
);

export interface DeliveryAttempt {
  id: string;
  note_id: string;
  route_id: string | null;
  attempt_number: number;
  driver_id: string | null;
  scheduled_date: string | null;
  vehicle_location: string | null;
  status: AttemptStatus;
  outcome: AttemptOutcome | null;
  failure_reason: string | null;
  failure_notes: string | null;
  order_number: string;
  client_name: string | null;
  address: string | null;
  delivery_instructions: string | null;
  partial_load: boolean;
  partial_load_reason: string | null;
  assigned_by: string | null;
  assigned_at: string;
  started_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
  version: number;
  created_at: string;
}

export interface DeliveryAttemptLine {
  id: string;
  attempt_id: string;
  note_item_id: string | null;
  product_id: string | null;
  product_code: string;
  product_name: string;
  details: string | null;
  colis_number: number;
  ordered_quantity: number;
  loaded_quantity: number;
  delivered_quantity: number;
  undelivered_reason: string | null;
  return_received_ok: number;
  return_received_damaged: number;
  return_location: string | null;
  received_at: string | null;
  exception_note: string | null;
}

export interface DeliveryEvent {
  id: string;
  note_id: string | null;
  attempt_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  actor: string | null;
  created_at: string;
}

const client = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

/** Quantas linhas ainda faltam receber no armazém para esta linha. */
export function pendingReturn(l: DeliveryAttemptLine) {
  return Math.max(
    l.loaded_quantity - l.delivered_quantity - l.return_received_ok - l.return_received_damaged,
    0,
  );
}

/**
 * Tentativas acessíveis ao utilizador autenticado (área do entregador).
 * O filtro real está no servidor: a rota é a fonte da atribuição e as regras
 * de acesso (RLS) só devolvem as entregas das rotas deste entregador —
 * ou, como exceção herdada, as que lhe foram atribuídas uma a uma.
 */
export function useMyDeliveryAttempts(routeId?: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['my-delivery-attempts', user?.id, routeId ?? 'todas'],
    enabled: !!user?.id,
    queryFn: async (): Promise<DeliveryAttempt[]> => {
      let q = client
        .from('delivery_attempts')
        .select('*')
        .in('status', ['assigned', 'in_transit'])
        .order('scheduled_date', { ascending: true })
        .order('attempt_number', { ascending: true });
      if (routeId) q = q.eq('route_id', routeId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as DeliveryAttempt[];
    },
    staleTime: 15 * 1000,
  });
}


export interface AttemptFilters {
  status?: AttemptStatus | 'all';
  outcome?: AttemptOutcome | 'all';
  routeId?: string | null;
  driverId?: string | null;
  from?: string | null;
  to?: string | null;
  search?: string;
}

/** Tentativas para responsáveis, com paginação completa (sem truncar). */
export function useDeliveryAttempts(filters: AttemptFilters = {}) {
  return useQuery({
    queryKey: ['delivery-attempts', filters],
    queryFn: async (): Promise<DeliveryAttempt[]> => {
      const rows: DeliveryAttempt[] = [];
      const page = 1000;
      for (let i = 0; ; i++) {
        let q = client
          .from('delivery_attempts')
          .select('*')
          .order('created_at', { ascending: false })
          .range(i * page, i * page + page - 1);
        if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status);
        if (filters.outcome && filters.outcome !== 'all') q = q.eq('outcome', filters.outcome);
        if (filters.routeId) q = q.eq('route_id', filters.routeId);
        if (filters.driverId) q = q.eq('driver_id', filters.driverId);
        if (filters.from) q = q.gte('scheduled_date', filters.from);
        if (filters.to) q = q.lte('scheduled_date', filters.to);
        if (filters.search) {
          const s = filters.search.replace(/[%,]/g, ' ').trim();
          if (s) q = q.or(`order_number.ilike.%${s}%,client_name.ilike.%${s}%`);
        }
        const { data, error } = await q;
        if (error) throw error;
        const batch = (data ?? []) as DeliveryAttempt[];
        rows.push(...batch);
        if (batch.length < page) break;
      }
      return rows;
    },
    staleTime: 15 * 1000,
  });
}

export function useAttemptLines(attemptId: string | null) {
  return useQuery({
    queryKey: ['delivery-attempt-lines', attemptId],
    enabled: !!attemptId,
    queryFn: async (): Promise<DeliveryAttemptLine[]> => {
      const { data, error } = await client
        .from('delivery_attempt_lines')
        .select('*')
        .eq('attempt_id', attemptId)
        .order('product_name', { ascending: true })
        .order('colis_number', { ascending: true });
      if (error) throw error;
      return (data ?? []) as DeliveryAttemptLine[];
    },
    staleTime: 10 * 1000,
  });
}

export function useDeliveryEvents(noteId: string | null) {
  return useQuery({
    queryKey: ['delivery-events', noteId],
    enabled: !!noteId,
    queryFn: async (): Promise<DeliveryEvent[]> => {
      const { data, error } = await client
        .from('delivery_events')
        .select('*')
        .eq('note_id', noteId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as DeliveryEvent[];
    },
  });
}

function useInvalidateDeliveries() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['delivery-attempts'] });
    qc.invalidateQueries({ queryKey: ['my-delivery-attempts'] });
    qc.invalidateQueries({ queryKey: ['delivery-attempt-lines'] });
    qc.invalidateQueries({ queryKey: ['delivery-events'] });
    qc.invalidateQueries({ queryKey: ['delivery-notes'] });
    qc.invalidateQueries({ queryKey: ['delivery-note-items'] });
    qc.invalidateQueries({ queryKey: ['products'] });
    qc.invalidateQueries({ queryKey: ['counts'] });
    qc.invalidateQueries({ queryKey: ['recent-movements'] });
  };
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export function useAssignAttempts() {
  const invalidate = useInvalidateDeliveries();
  return useMutation({
    mutationFn: (input: { noteIds: string[]; driverId: string; date: string | null }) =>
      rpc<{ created: number }>('assign_delivery_attempts', {
        p_note_ids: input.noteIds,
        p_driver: input.driverId,
        p_scheduled_date: input.date,
        p_op_key: crypto.randomUUID(),
      }),
    onSuccess: (r) => {
      invalidate();
      toast.success(`${r.created} entrega(s) atribuída(s)`);
    },
    onError: (e) => toast.error(mapDatabaseError(e)),
  });
}

export function useStartAttempt() {
  const invalidate = useInvalidateDeliveries();
  return useMutation({
    mutationFn: (attemptId: string) => rpc('start_delivery_attempt', { p_attempt_id: attemptId }),
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(mapDatabaseError(e)),
  });
}

export interface ConfirmLine {
  line_id: string;
  delivered_quantity: number;
  reason?: string | null;
}

export function useConfirmAttempt() {
  const invalidate = useInvalidateDeliveries();
  return useMutation({
    mutationFn: (input: {
      attemptId: string;
      lines: ConfirmLine[];
      failureReason?: string | null;
      failureNotes?: string | null;
      opKey: string;
      version?: number;
    }) =>
      rpc<{ outcome: AttemptOutcome; delivered: number; loaded: number; return_expected: number }>(
        'confirm_delivery_attempt',
        {
          p_attempt_id: input.attemptId,
          p_lines: input.lines,
          p_failure_reason: input.failureReason ?? null,
          p_failure_notes: input.failureNotes ?? null,
          p_op_key: input.opKey,
          p_expected_version: input.version ?? null,
        },
      ),
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(mapDatabaseError(e)),
  });
}

export function useReceiveReturn() {
  const invalidate = useInvalidateDeliveries();
  return useMutation({
    mutationFn: (input: {
      attemptId: string;
      lines: { line_id: string; quantity_ok: number; quantity_damaged: number; location: string | null }[];
      quarantineLocation: string;
    }) =>
      rpc<{ received_ok: number; received_damaged: number; exceptions: number }>(
        'receive_delivery_return',
        {
          p_attempt_id: input.attemptId,
          p_lines: input.lines,
          p_quarantine_location: input.quarantineLocation,
          p_op_key: crypto.randomUUID(),
        },
      ),
    onSuccess: (r) => {
      invalidate();
      toast.success(
        `Retorno conferido: ${r.received_ok} un. aptas, ${r.received_damaged} avariadas` +
          (r.exceptions > 0 ? ` — ${r.exceptions} diferença(s) por explicar` : ''),
      );
    },
    onError: (e) => toast.error(mapDatabaseError(e)),
  });
}

export function useRescheduleNote() {
  const invalidate = useInvalidateDeliveries();
  return useMutation({
    mutationFn: (input: { noteId: string; date: string; driverId: string | null }) =>
      rpc<{ attempt_number: number }>('reschedule_delivery_note', {
        p_note_id: input.noteId,
        p_scheduled_date: input.date,
        p_driver: input.driverId,
        p_op_key: crypto.randomUUID(),
      }),
    onSuccess: (r) => {
      invalidate();
      toast.success(`Nova tentativa criada (nº ${r.attempt_number})`);
    },
    onError: (e) => toast.error(mapDatabaseError(e)),
  });
}

export function useCancelNote() {
  const invalidate = useInvalidateDeliveries();
  return useMutation({
    mutationFn: (input: { noteId: string; reason: string }) =>
      rpc('cancel_delivery_note', {
        p_note_id: input.noteId,
        p_reason: input.reason,
        p_op_key: crypto.randomUUID(),
      }),
    onSuccess: () => {
      invalidate();
      toast.success('Encomenda cancelada');
    },
    onError: (e) => toast.error(mapDatabaseError(e)),
  });
}
