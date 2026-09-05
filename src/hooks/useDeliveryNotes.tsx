import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { mapDatabaseError } from '@/lib/errorMessages';

export type DeliveryStatus = 'picking' | 'staged' | 'loaded' | 'delivered' | 'returned';

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  picking: 'Em picking',
  staged: 'No cais',
  loaded: 'Em transporte',
  delivered: 'Entregue',
  returned: 'Devolvido',
};

export interface DeliveryNote {
  id: string;
  order_number: string;
  task_id: string | null;
  route_id: string | null;
  client_name: string | null;
  status: DeliveryStatus;
  dock_location: string | null;
  vehicle_location: string | null;
  notes: string | null;
  created_by: string | null;
  staged_at: string | null;
  loaded_at: string | null;
  delivered_at: string | null;
  delivered_by: string | null;
  returned_at: string | null;
  created_at: string;
}

export interface DeliveryNoteItem {
  id: string;
  note_id: string;
  product_id: string | null;
  product_code: string;
  product_name: string;
  details: string | null;
  quantity: number;
  staged_quantity: number;
  loaded_quantity: number;
  delivered_quantity: number;
  returned_quantity: number;
  location: string | null;
}

/** Notas de entrega, opcionalmente filtradas por estado. */
export function useDeliveryNotes(status: DeliveryStatus | 'all' = 'all') {
  return useQuery({
    queryKey: ['delivery-notes', status],
    queryFn: async (): Promise<DeliveryNote[]> => {
      let q = supabase
        .from('delivery_notes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (status !== 'all') q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as DeliveryNote[];
    },
    staleTime: 10 * 1000,
  });
}

export function useDeliveryNoteItems(noteIds: string[]) {
  const key = [...noteIds].sort().join(',');
  return useQuery({
    queryKey: ['delivery-note-items', key],
    enabled: noteIds.length > 0,
    queryFn: async (): Promise<DeliveryNoteItem[]> => {
      const { data, error } = await supabase
        .from('delivery_note_items')
        .select('*')
        .in('note_id', noteIds)
        .order('product_name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as DeliveryNoteItem[];
    },
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['delivery-notes'] });
    qc.invalidateQueries({ queryKey: ['delivery-note-items'] });
    qc.invalidateQueries({ queryKey: ['products'] });
    qc.invalidateQueries({ queryKey: ['counts'] });
    qc.invalidateQueries({ queryKey: ['recent-movements'] });
  };
}

export function useLoadNotesToVehicle() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: {
      noteIds: string[];
      vehicleLocation: string;
      items?: { item_id: string; quantity: number }[];
    }) => {
      const { data, error } = await supabase.rpc('load_notes_to_vehicle', {
        p_note_ids: input.noteIds,
        p_vehicle_location: input.vehicleLocation,
        p_items: (input.items ?? []) as unknown as never,
      });
      if (error) throw error;
      return data as unknown as { loaded: number; vehicle: string };
    },
    onSuccess: (r) => {
      invalidate();
      toast.success(`Carregado na ${r.vehicle} (${r.loaded} un.)`);
    },
    onError: (e) => toast.error('Erro ao carregar: ' + mapDatabaseError(e)),
  });
}

export function useDeliverNote() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (noteId: string) => {
      const { data, error } = await supabase.rpc('deliver_note', { p_note_id: noteId });
      if (error) throw error;
      return data as unknown as { units: number; order_number: string };
    },
    onSuccess: (r) => {
      invalidate();
      toast.success(`Entrega confirmada: nota ${r.order_number} (${r.units} un. de saída)`);
    },
    onError: (e) => toast.error('Erro ao confirmar entrega: ' + mapDatabaseError(e)),
  });
}

export function useReturnNote() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: { noteId: string; quarantineLocation: string }) => {
      const { data, error } = await supabase.rpc('return_note_items', {
        p_note_id: input.noteId,
        p_quarantine_location: input.quarantineLocation,
        p_items: [] as unknown as never,
      });
      if (error) throw error;
      return data as unknown as { moved: number };
    },
    onSuccess: (r) => {
      invalidate();
      toast.success(`Devolução registada (${r.moved} un. em quarentena)`);
    },
    onError: (e) => toast.error('Erro ao registar devolução: ' + mapDatabaseError(e)),
  });
}

export function useDeleteDeliveryNote() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (noteId: string) => {
      const { error } = await supabase.from('delivery_notes').delete().eq('id', noteId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Nota eliminada');
    },
    onError: (e) => toast.error('Erro ao eliminar nota: ' + mapDatabaseError(e)),
  });
}

/** Localizações por tipo (cais, viaturas, quarentena). */
export function useTypedLocations(type: 'pre_exit' | 'transport' | 'quarantine' | 'conferencia') {
  return useQuery({
    queryKey: ['warehouse-locations-typed', type],
    queryFn: async (): Promise<{ id: string; code: string }[]> => {
      const { data, error } = await supabase
        .from('warehouse_locations')
        .select('id, code')
        .eq('location_type', type)
        .order('code', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60 * 1000,
  });
}
