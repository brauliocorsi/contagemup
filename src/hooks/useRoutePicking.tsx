import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { mapDatabaseError } from '@/lib/errorMessages';
import { loadProductResolver } from '@/lib/logistics/productResolver';
import type { PickingTask, PickingTaskItem } from '@/hooks/useScannerPickingTasks';

export interface PersistedPickingItem extends PickingTaskItem {
  excluded: boolean;
  shortage_quantity?: number;
}

export interface PersistedPicking {
  task: PickingTask & { route_id: string | null };
  items: PersistedPickingItem[];
  /** por separar | parcial | separado */
  progress: 'pending' | 'partial' | 'done';
  requested: number;
  picked: number;
}

function progressOf(items: PersistedPickingItem[]): PersistedPicking['progress'] {
  const active = items.filter((i) => !i.excluded);
  const requested = active.reduce((s, i) => s + i.requested_quantity, 0);
  const picked = active.reduce((s, i) => s + i.picked_quantity, 0);
  if (picked <= 0) return 'pending';
  if (picked >= requested && requested > 0) return 'done';
  return 'partial';
}

export const PICKING_PROGRESS_LABELS: Record<PersistedPicking['progress'], string> = {
  pending: 'Por separar',
  partial: 'Parcialmente separado',
  done: 'Separado',
};

async function loadTask(taskId: string): Promise<PersistedPicking> {
  const { data: task, error } = await supabase
    .from('scanner_picking_tasks')
    .select('*')
    .eq('id', taskId)
    .single();
  if (error) throw error;
  const { data: items, error: itemsErr } = await supabase
    .from('scanner_picking_task_items')
    .select('*')
    .eq('task_id', taskId)
    .order('product_name', { ascending: true });
  if (itemsErr) throw itemsErr;
  const list = (items ?? []) as unknown as PersistedPickingItem[];
  const active = list.filter((i) => !i.excluded);
  return {
    task: task as unknown as PersistedPicking['task'],
    items: list,
    progress: progressOf(list),
    requested: active.reduce((s, i) => s + i.requested_quantity, 0),
    picked: active.reduce((s, i) => s + i.picked_quantity, 0),
  };
}

/** Picking já guardado de uma rota (o trabalho deixa de se perder ao fechar a página). */
export function useRoutePicking(routeId: string | null) {
  return useQuery({
    queryKey: ['route-picking', routeId],
    enabled: Boolean(routeId),
    queryFn: async (): Promise<PersistedPicking | null> => {
      const { data, error } = await supabase
        .from('scanner_picking_tasks')
        .select('id')
        .eq('route_id', routeId!)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      const id = data?.[0]?.id as string | undefined;
      if (!id) return null;
      return loadTask(id);
    },
    staleTime: 10 * 1000,
  });
}

/** Tarefas abertas que já incluem alguma destas notas de encomenda. */
export async function findTasksForOrders(orderCodes: string[]): Promise<PickingTask[]> {
  const codes = orderCodes.map((c) => c.trim()).filter(Boolean);
  if (codes.length === 0) return [];
  const { data, error } = await supabase
    .from('scanner_picking_task_items')
    .select('orders, scanner_picking_tasks!inner(id, name, reference, status, created_at, route_id)')
    .in('orders', codes)
    .limit(500);
  if (error) throw error;
  type Row = { scanner_picking_tasks: PickingTask & { status: string } };
  const seen = new Map<string, PickingTask>();
  for (const r of (data ?? []) as unknown as Row[]) {
    const t = r.scanner_picking_tasks;
    if (!t || t.status === 'cancelled' || t.status === 'completed') continue;
    seen.set(t.id, t as PickingTask);
  }
  return [...seen.values()];
}

export interface SavePickingLine {
  key: string;
  product_code: string;
  product_name: string;
  details?: string | null;
  orders?: string | null;
  locations?: string | null;
  requested_quantity: number;
  excluded: boolean;
}

/**
 * Guarda (cria ou substitui) a tarefa de picking de uma rota, incluindo
 * as linhas excluídas pelo utilizador — que ficam registadas, não desaparecem.
 */
export function useSaveRoutePicking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      routeId: string | null;
      name: string;
      reference?: string | null;
      notes?: string | null;
      lines: SavePickingLine[];
      existingTaskId?: string | null;
    }): Promise<string> => {
      const { data: userData } = await supabase.auth.getUser();
      let taskId = input.existingTaskId ?? null;

      if (!taskId && input.routeId) {
        const { data } = await supabase
          .from('scanner_picking_tasks')
          .select('id')
          .eq('route_id', input.routeId)
          .neq('status', 'cancelled')
          .order('created_at', { ascending: false })
          .limit(1);
        taskId = (data?.[0]?.id as string | undefined) ?? null;
      }

      if (taskId) {
        const { error } = await supabase
          .from('scanner_picking_tasks')
          .update({ name: input.name, reference: input.reference ?? null, notes: input.notes ?? null })
          .eq('id', taskId);
        if (error) throw error;
        // linhas ainda não separadas são substituídas; o que já foi separado mantém-se
        const { error: delErr } = await supabase
          .from('scanner_picking_task_items')
          .delete()
          .eq('task_id', taskId)
          .eq('picked_quantity', 0);
        if (delErr) throw delErr;
      } else {
        const { data: task, error } = await supabase
          .from('scanner_picking_tasks')
          .insert({
            name: input.name,
            reference: input.reference ?? null,
            notes: input.notes ?? null,
            source: 'separacao',
            route_id: input.routeId,
            created_by: userData.user?.id ?? null,
          })
          .select('id')
          .single();
        if (error) throw error;
        taskId = task.id as string;
      }

      const { data: kept } = await supabase
        .from('scanner_picking_task_items')
        .select('product_code, product_name, orders')
        .eq('task_id', taskId);
      const keptKeys = new Set(
        (kept ?? []).map((k) => `${k.product_code}||${k.product_name}||${k.orders ?? ''}`),
      );

      const resolver = await loadProductResolver();
      const rows = input.lines
        .filter(
          (l) => !keptKeys.has(`${l.product_code}||${l.product_name}||${l.orders ?? ''}`),
        )
        .map((l) => ({
          task_id: taskId!,
          product_id: resolver.resolve(l.product_code, l.product_name) ?? null,
          product_code: l.product_code || '',
          product_name: l.product_name,
          details: l.details ?? null,
          orders: l.orders ?? null,
          locations: l.locations ?? null,
          requested_quantity: l.requested_quantity,
          excluded: l.excluded,
        }));
      if (rows.length > 0) {
        const { error: insErr } = await supabase.from('scanner_picking_task_items').insert(rows);
        if (insErr) throw insErr;
      }
      return taskId!;
    },
    onSuccess: (_id, v) => {
      qc.invalidateQueries({ queryKey: ['route-picking', v.routeId] });
      qc.invalidateQueries({ queryKey: ['scanner-picking-tasks'] });
      qc.invalidateQueries({ queryKey: ['scanner-picking-tasks-all'] });
    },
    onError: (e) => toast.error('Erro ao guardar o picking: ' + mapDatabaseError(e)),
  });
}

/** Marca/desmarca uma linha como excluída, sem a apagar. */
export function useTogglePickingItemExcluded() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { itemId: string; excluded: boolean; routeId: string | null }) => {
      const { error } = await supabase
        .from('scanner_picking_task_items')
        .update({ excluded: input.excluded })
        .eq('id', input.itemId);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['route-picking', v.routeId] });
    },
    onError: (e) => toast.error('Erro ao atualizar a linha: ' + mapDatabaseError(e)),
  });
}
