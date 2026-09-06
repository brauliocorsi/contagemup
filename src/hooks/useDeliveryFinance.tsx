import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { mapDatabaseError } from '@/lib/errorMessages';

/**
 * Camada financeira operacional da rota: previsto importado da Gestão Click,
 * recebimentos declarados pelo entregador, prestação de contas por rota
 * (envelope de numerário) e conferência pelo financeiro.
 *
 * Nada aqui escreve na Gestão Click: a importação é apenas leitura.
 */

const client = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  functions: { invoke: (name: string, opts?: Record<string, unknown>) => Promise<any> };
};

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export type MethodKind = 'cash' | 'card' | 'transfer' | 'other';

export interface PaymentMethod {
  id: string;
  label: string;
  kind: MethodKind;
  collect_on_delivery: boolean;
  requires_reference: boolean;
  active: boolean;
  display_order: number;
}

export interface NotePayable {
  id: string;
  note_id: string;
  revision: number;
  parcel_key: string;
  gc_sale_id: string | null;
  gc_sale_code: string | null;
  method_id: string | null;
  method_raw_name: string | null;
  classification: 'collect_on_delivery' | 'already_paid' | 'unknown';
  amount_cents: number;
  due_date: string | null;
  gc_status: string | null;
  exception_note: string | null;
  fetched_at: string | null;
  source_url: string | null;
}

export type AmountDueState =
  | 'por_importar'
  | 'desatualizado'
  | 'revisao_pendente'
  | 'por_rever'
  | 'contraditorio'
  | 'ja_pago_no_gc'
  | 'recebido_antes'
  | 'a_cobrar'
  | 'ajustado';

export interface AmountDue {
  has_previsto: boolean;
  revision: number | null;
  latest_revision: number | null;
  state: AmountDueState;
  reliable: boolean;
  requires_review: boolean;
  state_note: string | null;
  expected_cents: number;
  already_paid_cents: number;
  paid_previous_attempts_cents: number;
  override_cents: number | null;
  unknown_parcels: number;
  gc_sale_id: string | null;
  due_cents: number;
}


export interface DeliveryPayment {
  id: string;
  attempt_id: string;
  note_id: string;
  route_id: string | null;
  method_id: string;
  amount_cents: number;
  gross_cents: number | null;
  change_cents: number;
  reference: string | null;
  notes: string | null;
  difference_reason: string | null;
  declared_by: string;
  declared_at: string;
  locked: boolean;
  closure_id: string | null;
}

export interface RouteCashClosure {
  id: string;
  route_id: string;
  driver_id: string;
  envelope_code: string;
  cash_declared_cents: number;
  no_cash: boolean;
  totals: Record<string, number>;
  expected_cents: number;
  declared_cents: number;
  exceptions: { attempt_id: string; order_number: string; status: string }[];
  notes: string | null;
  status: 'submitted' | 'counting' | 'resolved';
  submitted_by: string;
  submitted_at: string;
  counted_cents: number | null;
  counted_by: string | null;
  counted_at: string | null;
  difference_cents: number | null;
  resolution_note: string | null;
  resolved_at: string | null;
}

export interface MethodCheck {
  id: string;
  closure_id: string;
  method_id: string;
  declared_cents: number;
  confirmed_cents: number | null;
  reference: string | null;
  status: 'pending' | 'confirmed' | 'divergent';
  note: string | null;
  confirmed_at: string | null;
}

export interface PrevistoImport {
  id: string;
  route_id: string;
  composition_version: number;
  status: 'running' | 'completed' | 'partial' | 'failed';
  notes_total: number;
  notes_ok: number;
  notes_failed: number;
  failures: { note_id: string; order_number: string; reason: string }[];
  invalidated_at: string | null;
  invalidated_reason: string | null;
  created_at: string;
}

/* ---------------- consultas ---------------- */

export function usePaymentMethods() {
  return useQuery({
    queryKey: ['payment-methods'],
    queryFn: async (): Promise<PaymentMethod[]> => {
      const { data, error } = await client
        .from('payment_methods')
        .select('*')
        .eq('active', true)
        .order('display_order');
      if (error) throw error;
      return (data ?? []) as PaymentMethod[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useAttemptAmountDue(attemptId: string | null) {
  return useQuery({
    queryKey: ['attempt-amount-due', attemptId],
    enabled: !!attemptId,
    queryFn: () => rpc<AmountDue>('attempt_amount_due', { p_attempt_id: attemptId }),
    staleTime: 30 * 1000,
  });
}

export function useNotePayables(noteId: string | null) {
  return useQuery({
    queryKey: ['note-payables', noteId],
    enabled: !!noteId,
    queryFn: async (): Promise<NotePayable[]> => {
      const { data, error } = await client
        .from('delivery_note_payables')
        .select('*')
        .eq('note_id', noteId)
        .eq('active', true)
        .order('revision', { ascending: false });
      if (error) throw error;
      return (data ?? []) as NotePayable[];
    },
  });
}

export function useAttemptPayments(attemptId: string | null) {
  return useQuery({
    queryKey: ['attempt-payments', attemptId],
    enabled: !!attemptId,
    queryFn: async (): Promise<DeliveryPayment[]> => {
      const { data, error } = await client
        .from('delivery_payments')
        .select('*')
        .eq('attempt_id', attemptId)
        .order('declared_at');
      if (error) throw error;
      return (data ?? []) as DeliveryPayment[];
    },
  });
}

export function useRoutePayments(routeId: string | null) {
  return useQuery({
    queryKey: ['route-payments', routeId],
    enabled: !!routeId,
    queryFn: async (): Promise<DeliveryPayment[]> => {
      const { data, error } = await client
        .from('delivery_payments')
        .select('*')
        .eq('route_id', routeId)
        .order('declared_at');
      if (error) throw error;
      return (data ?? []) as DeliveryPayment[];
    },
  });
}

export function useRouteImports(routeId: string | null) {
  return useQuery({
    queryKey: ['route-previsto-imports', routeId],
    enabled: !!routeId,
    queryFn: async (): Promise<PrevistoImport[]> => {
      const { data, error } = await client
        .from('route_previsto_imports')
        .select('*')
        .eq('route_id', routeId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as PrevistoImport[];
    },
  });
}

export function useRoutePayables(routeId: string | null) {
  return useQuery({
    queryKey: ['route-payables', routeId],
    enabled: !!routeId,
    queryFn: async (): Promise<NotePayable[]> => {
      const { data, error } = await client
        .from('delivery_note_payables')
        .select('*')
        .eq('route_id', routeId)
        .eq('active', true);
      if (error) throw error;
      return (data ?? []) as NotePayable[];
    },
  });
}

export interface ClosureFilters {
  status?: 'all' | 'submitted' | 'counting' | 'resolved';
  routeId?: string | null;
  driverId?: string | null;
}

export function useCashClosures(filters: ClosureFilters = {}) {
  return useQuery({
    queryKey: ['cash-closures', filters],
    queryFn: async (): Promise<RouteCashClosure[]> => {
      const rows: RouteCashClosure[] = [];
      const page = 1000;
      for (let i = 0; ; i++) {
        let q = client
          .from('route_cash_closures')
          .select('*')
          .order('submitted_at', { ascending: false })
          .range(i * page, i * page + page - 1);
        if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status);
        if (filters.routeId) q = q.eq('route_id', filters.routeId);
        if (filters.driverId) q = q.eq('driver_id', filters.driverId);
        const { data, error } = await q;
        if (error) throw error;
        const batch = (data ?? []) as RouteCashClosure[];
        rows.push(...batch);
        if (batch.length < page) break;
      }
      return rows;
    },
  });
}

export function useClosureChecks(closureId: string | null) {
  return useQuery({
    queryKey: ['closure-checks', closureId],
    enabled: !!closureId,
    queryFn: async (): Promise<MethodCheck[]> => {
      const { data, error } = await client
        .from('route_closure_method_checks')
        .select('*')
        .eq('closure_id', closureId)
        .order('method_id');
      if (error) throw error;
      return (data ?? []) as MethodCheck[];
    },
  });
}

export function useMyRouteClosure(routeId: string | null, driverId: string | undefined) {
  return useQuery({
    queryKey: ['my-route-closure', routeId, driverId],
    enabled: !!routeId && !!driverId,
    queryFn: async (): Promise<RouteCashClosure | null> => {
      const { data, error } = await client
        .from('route_cash_closures')
        .select('*')
        .eq('route_id', routeId)
        .eq('driver_id', driverId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as RouteCashClosure | null;
    },
  });
}

/* ---------------- mutações ---------------- */

function useInvalidateFinance() {
  const qc = useQueryClient();
  return () => {
    [
      'attempt-amount-due',
      'attempt-payments',
      'route-payments',
      'note-payables',
      'route-payables',
      'route-previsto-imports',
      'cash-closures',
      'closure-checks',
      'my-route-closure',
      'routes',
      'route',
    ].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  };
}

export function useCloseRoutePreparation() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: (routeId: string) =>
      rpc<{ closed?: boolean; already_closed?: boolean }>('close_route_preparation', {
        p_route_id: routeId,
      }),
    onSuccess: (r) => {
      invalidate();
      toast.success(r.already_closed ? 'A preparação já estava fechada' : 'Preparação fechada');
    },
    onError: (e) => toast.error(mapDatabaseError(e)),
  });
}

export function useReopenRoutePreparation() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: (input: { routeId: string; reason: string }) =>
      rpc('reopen_route_preparation', { p_route_id: input.routeId, p_reason: input.reason }),
    onSuccess: () => {
      invalidate();
      toast.success('Preparação reaberta — a importação anterior ficou marcada como desactualizada');
    },
    onError: (e) => toast.error(mapDatabaseError(e)),
  });
}

export function useImportPrevisto() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: async (input: { routeId: string; noteIds?: string[]; opKey?: string }) => {
      const { data, error } = await client.functions.invoke('route-previsto-import', {
        body: {
          route_id: input.routeId,
          note_ids: input.noteIds,
          op_key: input.opKey ?? crypto.randomUUID(),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { import: PrevistoImport; failures: PrevistoImport['failures'] };
    },
    onSuccess: (r) => {
      invalidate();
      const i = r.import;
      if (i.status === 'completed') toast.success(`Previsto importado para ${i.notes_ok} nota(s)`);
      else if (i.status === 'partial')
        toast.warning(`Importação parcial: ${i.notes_ok} ok, ${i.notes_failed} por resolver`);
      else toast.error('A importação falhou em todas as notas');
    },
    onError: (e) => toast.error(mapDatabaseError(e)),
  });
}

export function useSetPayableOverride() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: (input: { attemptId: string; amountCents: number; reason: string }) =>
      rpc('set_attempt_payable_override', {
        p_attempt_id: input.attemptId,
        p_amount_cents: input.amountCents,
        p_reason: input.reason,
      }),
    onSuccess: () => {
      invalidate();
      toast.success('Valor a cobrar ajustado nesta tentativa');
    },
    onError: (e) => toast.error(mapDatabaseError(e)),
  });
}

export interface PaymentLineInput {
  method_id: string;
  amount_cents: number;
  gross_cents?: number | null;
  change_cents?: number;
  reference?: string | null;
  notes?: string | null;
}

export function useDeclarePayments() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: (input: {
      attemptId: string;
      lines: PaymentLineInput[];
      differenceReason: string | null;
      opKey: string;
    }) =>
      rpc<{ total_cents: number; due_cents: number; difference_cents: number }>(
        'declare_delivery_payments',
        {
          p_attempt_id: input.attemptId,
          p_lines: input.lines,
          p_difference_reason: input.differenceReason,
          p_op_key: input.opKey,
        },
      ),
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(mapDatabaseError(e)),
  });
}

export function useSubmitRouteAccounting() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: (input: {
      routeId: string;
      cashCents: number;
      noCash: boolean;
      notes: string | null;
      opKey: string;
    }) =>
      rpc<{ closure_id: string; envelope_code: string }>('submit_route_accounting', {
        p_route_id: input.routeId,
        p_cash_cents: input.cashCents,
        p_no_cash: input.noCash,
        p_notes: input.notes,
        p_op_key: input.opKey,
      }),
    onSuccess: (r) => {
      invalidate();
      toast.success(`Contas fechadas — envelope ${r.envelope_code}`);
    },
    onError: (e) => toast.error(mapDatabaseError(e)),
  });
}

export function useCountEnvelope() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: (input: { closureId: string; countedCents: number; note: string }) =>
      rpc<{ difference_cents: number }>('finance_count_envelope', {
        p_closure_id: input.closureId,
        p_counted_cents: input.countedCents,
        p_note: input.note,
      }),
    onSuccess: (r) => {
      invalidate();
      toast.success(
        r.difference_cents === 0
          ? 'Envelope conferido sem diferença'
          : 'Envelope conferido — diferença registada',
      );
    },
    onError: (e) => toast.error(mapDatabaseError(e)),
  });
}

export function useConfirmMethodCheck() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: (input: {
      checkId: string;
      confirmedCents: number;
      reference: string;
      note: string;
    }) =>
      rpc('finance_confirm_method', {
        p_check_id: input.checkId,
        p_confirmed_cents: input.confirmedCents,
        p_reference: input.reference,
        p_note: input.note,
      }),
    onSuccess: () => {
      invalidate();
      toast.success('Conferência registada');
    },
    onError: (e) => toast.error(mapDatabaseError(e)),
  });
}

export function useResolveClosure() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: (input: { closureId: string; note: string }) =>
      rpc('finance_resolve_closure', { p_closure_id: input.closureId, p_note: input.note }),
    onSuccess: () => {
      invalidate();
      toast.success('Prestação de contas concluída');
    },
    onError: (e) => toast.error(mapDatabaseError(e)),
  });
}
