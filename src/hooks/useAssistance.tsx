import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { mapDatabaseError } from '@/lib/errorMessages';

/**
 * Assistências abertas durante a entrega. A ocorrência fica sempre gravada
 * localmente; o envio para o Apoio ao Cliente é uma fila que pode ser repetida
 * sem duplicar o ticket. Abrir assistência não cria retorno nem avaria.
 */

const client = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  functions: { invoke: (name: string, opts?: Record<string, unknown>) => Promise<any> };
  storage: { from: (b: string) => any };
};

export const ASSISTANCE_BUCKET = 'assistencias';

export type Disposition = 'cliente' | 'viatura' | 'retorno';

export const DISPOSITION_LABELS: Record<Disposition, string> = {
  cliente: 'Ficou no cliente',
  viatura: 'Ficou na viatura',
  retorno: 'Volta ao armazém',
};

export interface IncidentLineInput {
  product_id: string | null;
  product_code: string;
  product_name: string;
  colis_number: number;
  quantity: number;
  disposition: Disposition;
}

export interface DeliveryIncident {
  id: string;
  attempt_id: string | null;
  note_id: string | null;
  route_id: string | null;
  order_number: string;
  client_name: string | null;
  subject: string;
  description: string;
  delivery_outcome: string | null;
  product_lines: IncidentLineInput[];
  attachments: { name: string; mime_type: string; storage_reference: string }[];
  driver_id: string | null;
  occurred_at: string;
  dispatch_status: 'pending' | 'sent' | 'error';
  dispatch_attempts: number;
  last_error: string | null;
  ticket_id: string | null;
  ticket_number: string | null;
  deduplicated: boolean | null;
  created_at: string;
}

export const DISPATCH_LABELS: Record<DeliveryIncident['dispatch_status'], string> = {
  pending: 'Por enviar',
  sent: 'Enviada',
  error: 'Erro no envio',
};

export function useIncidents(filters: { attemptId?: string | null; status?: string } = {}) {
  return useQuery({
    queryKey: ['delivery-incidents', filters],
    queryFn: async (): Promise<DeliveryIncident[]> => {
      let q = client
        .from('delivery_incidents')
        .select('*')
        .order('created_at', { ascending: false });
      if (filters.attemptId) q = q.eq('attempt_id', filters.attemptId);
      if (filters.status && filters.status !== 'all') q = q.eq('dispatch_status', filters.status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as DeliveryIncident[];
    },
  });
}

/** Envia o anexo para armazenamento privado, dentro da pasta do próprio utilizador. */
export async function uploadIncidentAttachment(userId: string, file: File) {
  const path = `${userId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]/g, '_')}`;
  const { error } = await client.storage.from(ASSISTANCE_BUCKET).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });
  if (error) throw error;
  return { name: file.name, mime_type: file.type || 'application/octet-stream', storage_reference: path };
}

export function useOpenIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      attemptId: string;
      subject: string;
      description: string;
      lines: IncidentLineInput[];
      attachments: { name: string; mime_type: string; storage_reference: string }[];
      opKey: string;
    }) => {
      const { data, error } = await client.rpc('open_delivery_incident', {
        p_attempt_id: input.attemptId,
        p_subject: input.subject,
        p_description: input.description,
        p_lines: input.lines,
        p_attachments: input.attachments,
        p_op_key: input.opKey,
      });
      if (error) throw error;
      // envio para o Apoio ao Cliente: falhar aqui não perde a ocorrência
      const incidentId = (data as { incident_id: string }).incident_id;
      await client.functions
        .invoke('assistance-dispatch', { body: { incident_ids: [incidentId] } })
        .catch(() => null);
      return data as { incident_id: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['delivery-incidents'] });
      toast.success('Assistência registada');
    },
    onError: (e) => toast.error(mapDatabaseError(e)),
  });
}

export function useDispatchIncidents() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (incidentIds?: string[]) => {
      const { data, error } = await client.functions.invoke('assistance-dispatch', {
        body: incidentIds ? { incident_ids: incidentIds } : {},
      });
      if (error) throw error;
      return data as {
        blocked?: boolean;
        reason?: string;
        processed?: number;
        results?: { status: string; error?: string }[];
      };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['delivery-incidents'] });
      if (r.blocked) toast.warning(r.reason ?? 'Integração do Apoio ao Cliente por configurar');
      else {
        const sent = (r.results ?? []).filter((x) => x.status === 'sent').length;
        const failed = (r.results ?? []).length - sent;
        toast.success(`${sent} assistência(s) enviada(s)${failed ? `, ${failed} com erro` : ''}`);
      }
    },
    onError: (e) => toast.error(mapDatabaseError(e)),
  });
}
