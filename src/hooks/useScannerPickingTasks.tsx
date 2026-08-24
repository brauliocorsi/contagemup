import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { mapDatabaseError } from '@/lib/errorMessages';
import { loadProductResolver } from '@/lib/logistics/productResolver';

export interface PickingTask {
  id: string;
  name: string;
  reference: string | null;
  source: string;
  notes: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface PickingTaskItem {
  id: string;
  task_id: string;
  product_id: string | null;
  product_code: string;
  product_name: string;
  details: string | null;
  orders: string | null;
  locations: string | null;
  requested_quantity: number;
  picked_quantity: number;
}

export interface NewPickingTaskItem {
  product_code: string;
  product_name: string;
  details?: string | null;
  orders?: string | null;
  locations?: string | null;
  requested_quantity: number;
}

/** Resolve product ids by code, supplier code or product name. */
async function resolveProductIds(
  items: { product_code: string; product_name: string }[],
): Promise<Map<string, string>> {
  const resolver = await loadProductResolver();
  const map = new Map<string, string>();
  for (const it of items) {
    const id = resolver.resolve(it.product_code, it.product_name);
    if (id) map.set(`${it.product_code}||${it.product_name}`, id);
  }
  return map;
}

/** Tarefas de picking abertas (para o scanner). */
export function useOpenPickingTasks() {
  return useQuery({
    queryKey: ['scanner-picking-tasks'],
    queryFn: async (): Promise<PickingTask[]> => {
      const { data, error } = await supabase
        .from('scanner_picking_tasks')
        .select('*')
        .in('status', ['pending', 'in_progress'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as PickingTask[];
    },
    staleTime: 10 * 1000,
  });
}

export function usePickingTaskItems(taskId: string | null) {
  return useQuery({
    queryKey: ['scanner-picking-task-items', taskId],
    enabled: !!taskId,
    queryFn: async (): Promise<PickingTaskItem[]> => {
      const { data, error } = await supabase
        .from('scanner_picking_task_items')
        .select('*')
        .eq('task_id', taskId!)
        .order('product_name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as PickingTaskItem[];
    },
  });
}

export function useCreatePickingTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      reference?: string | null;
      notes?: string | null;
      items: NewPickingTaskItem[];
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      const { data: task, error } = await supabase
        .from('scanner_picking_tasks')
        .insert({
          name: input.name,
          reference: input.reference ?? null,
          notes: input.notes ?? null,
          source: 'separacao',
          created_by: userData.user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;

      const ids = await resolveProductIds(input.items);
      const rows = input.items.map((i) => ({
        task_id: task.id,
        product_id: ids.get(`${i.product_code}||${i.product_name}`) ?? null,
        product_code: i.product_code || '',
        product_name: i.product_name,
        details: i.details ?? null,
        orders: i.orders ?? null,
        locations: i.locations ?? null,
        requested_quantity: i.requested_quantity,
      }));
      const { error: itemsError } = await supabase.from('scanner_picking_task_items').insert(rows);
      if (itemsError) throw itemsError;
      return task as PickingTask;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scanner-picking-tasks'] });
    },
    onError: (e) => toast.error('Erro ao enviar para o scanner: ' + mapDatabaseError(e)),
  });
}

/** Guarda o progresso de um artigo (quantidade conferida). */
export function useSavePickingProgress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      taskId,
      itemId,
      picked,
    }: {
      taskId: string;
      itemId: string;
      picked: number;
    }) => {
      const { error } = await supabase
        .from('scanner_picking_task_items')
        .update({ picked_quantity: picked })
        .eq('id', itemId);
      if (error) throw error;
      await supabase
        .from('scanner_picking_tasks')
        .update({ status: 'in_progress', started_at: new Date().toISOString() })
        .eq('id', taskId)
        .eq('status', 'pending');
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['scanner-picking-task-items', vars.taskId] });
      queryClient.invalidateQueries({ queryKey: ['scanner-picking-tasks'] });
    },
    onError: (e) => toast.error('Erro ao guardar progresso: ' + mapDatabaseError(e)),
  });
}

export function useClosePickingTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: 'completed' | 'cancelled' }) => {
      const { error } = await supabase
        .from('scanner_picking_tasks')
        .update({ status, completed_at: new Date().toISOString() })
        .eq('id', taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scanner-picking-tasks'] });
    },
    onError: (e) => toast.error('Erro ao fechar tarefa: ' + mapDatabaseError(e)),
  });
}
