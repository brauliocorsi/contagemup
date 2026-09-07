import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PickingItemColi {
  id: string;
  item_id: string;
  colis_number: number;
  requested_quantity: number;
  picked_quantity: number;
  from_location: string | null;
  evidence: string;
}

export interface NoteItemColi {
  id: string;
  note_item_id: string;
  colis_number: number;
  requested_quantity: number;
  staged_quantity: number;
  loaded_quantity: number;
  location: string | null;
  evidence: string;
}

/** Volumes previstos/separados de cada artigo de uma tarefa de separação. */
export function usePickingItemColis(itemIds: string[]) {
  const key = [...itemIds].sort().join(',');
  return useQuery({
    queryKey: ['picking-item-colis', key],
    enabled: itemIds.length > 0,
    staleTime: 5 * 1000,
    queryFn: async (): Promise<PickingItemColi[]> => {
      const { data, error } = await supabase
        .from('picking_item_colis')
        .select('*')
        .in('item_id', itemIds)
        .order('colis_number', { ascending: true });
      if (error) throw error;
      return (data ?? []) as PickingItemColi[];
    },
  });
}

/** Volumes previstos/no cais/carregados de cada artigo de uma nota. */
export function useNoteItemColis(noteItemIds: string[]) {
  const key = [...noteItemIds].sort().join(',');
  return useQuery({
    queryKey: ['note-item-colis', key],
    enabled: noteItemIds.length > 0,
    staleTime: 5 * 1000,
    queryFn: async (): Promise<NoteItemColi[]> => {
      const { data, error } = await supabase
        .from('delivery_note_item_colis')
        .select('*')
        .in('note_item_id', noteItemIds)
        .order('colis_number', { ascending: true });
      if (error) throw error;
      return (data ?? []) as NoteItemColi[];
    },
  });
}

export interface StageColiLine {
  item_id: string | null;
  product_id: string | null;
  product_code: string;
  product_name: string;
  details: string | null;
  client_name?: string | null;
  order_number: string;
  quantity: number;
  shortage_reason?: string | null;
  shortage_notes?: string | null;
  colis: { colis_number: number; quantity: number; from_location: string }[];
}

export interface StageColiResult {
  dock: string;
  volumes_moved: number;
  notes_created: string[];
  lines: Array<{
    item_id: string | null;
    note_item_id: string;
    order_number: string;
    product_code: string;
    requested_sets: number;
    complete_sets: number;
    colis: { colis_number: number; moved: number; from_location: string }[];
    pending: { colis_number: number; pending: number }[];
  }>;
}

function useInvalidateStock() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['products'] });
    qc.invalidateQueries({ queryKey: ['counts'] });
    qc.invalidateQueries({ queryKey: ['delivery-notes'] });
    qc.invalidateQueries({ queryKey: ['delivery-note-items'] });
    qc.invalidateQueries({ queryKey: ['note-item-colis'] });
    qc.invalidateQueries({ queryKey: ['picking-item-colis'] });
    qc.invalidateQueries({ queryKey: ['scanner-picking-task-items'] });
    qc.invalidateQueries({ queryKey: ['scanner-picking-tasks'] });
    qc.invalidateQueries({ queryKey: ['recent-movements'] });
  };
}

/** Envia para o cais o que foi conferido volume a volume. */
export function useStagePickingColis() {
  const invalidate = useInvalidateStock();
  return useMutation({
    mutationFn: async (input: {
      taskId: string | null;
      dock: string;
      lines: StageColiLine[];
      opKey: string;
    }) => {
      const { data, error } = await supabase.rpc('stage_picking_colis', {
        p_task_id: input.taskId,
        p_dock_location: input.dock,
        p_lines: input.lines as unknown as never,
        p_op_key: input.opKey,
      });
      if (error) throw error;
      return data as unknown as StageColiResult;
    },
    onSuccess: () => invalidate(),
  });
}

export interface LoadColiLine {
  note_item_id: string;
  colis: { colis_number: number; quantity: number }[];
}

export interface LoadColiResult {
  vehicle: string;
  volumes_loaded: number;
  notes: number;
  lines: Array<{
    note_item_id: string;
    order_number: string;
    complete_sets: number;
    colis: { colis_number: number; loaded: number }[];
    pending: { colis_number: number; pending: number }[];
  }>;
}

/** Move do cais para a viatura apenas os volumes conferidos. */
export function useLoadNotesColis() {
  const invalidate = useInvalidateStock();
  return useMutation({
    mutationFn: async (input: { vehicle: string; lines: LoadColiLine[]; opKey: string }) => {
      const { data, error } = await supabase.rpc('load_notes_colis', {
        p_vehicle_location: input.vehicle,
        p_lines: input.lines as unknown as never,
        p_op_key: input.opKey,
      });
      if (error) throw error;
      return data as unknown as LoadColiResult;
    },
    onSuccess: () => invalidate(),
  });
}
