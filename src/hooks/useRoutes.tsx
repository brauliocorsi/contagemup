import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { mapDatabaseError } from '@/lib/errorMessages';

export type RouteStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export const ROUTE_STATUS_LABELS: Record<RouteStatus, string> = {
  pending: 'Planeada',
  in_progress: 'Em curso',
  completed: 'Concluída',
  cancelled: 'Cancelada',
};

export const ACTIVE_ROUTE_STATUSES: RouteStatus[] = ['pending', 'in_progress'];

export interface RouteSchedule {
  id: string;
  name: string;
  scheduled_date: string;
  status: RouteStatus;
  notes: string | null;
  departure_address: string | null;
  created_at: string;
}

export interface RouteStop {
  id: string;
  route_id: string;
  client_name: string;
  address: string | null;
  order_number: number;
  venda_id: string | null;
  venda_codigo: string | null;
  venda_data: string | null;
  venda_status: string | null;
  status: string;
  notes: string | null;
}

/** Matrícula é guardada nas notas da rota (`Matrícula: XX`). */
export function plateFromNotes(notes: string | null): string {
  const m = /Matrícula:\s*([A-Z0-9-]+)/i.exec(notes ?? '');
  return m?.[1] ?? '';
}

export function useRoutes() {
  return useQuery({
    queryKey: ['routes'],
    queryFn: async (): Promise<(RouteSchedule & { stops: number })[]> => {
      const { data, error } = await supabase
        .from('route_schedules')
        .select('*')
        .order('scheduled_date', { ascending: false })
        .limit(500);
      if (error) throw error;
      const routes = (data ?? []) as unknown as RouteSchedule[];
      if (routes.length === 0) return [];
      const { data: stops, error: stopsErr } = await supabase
        .from('route_stops')
        .select('route_id')
        .in('route_id', routes.map((r) => r.id));
      if (stopsErr) throw stopsErr;
      const counts = new Map<string, number>();
      for (const s of stops ?? []) counts.set(s.route_id, (counts.get(s.route_id) ?? 0) + 1);
      return routes.map((r) => ({ ...r, stops: counts.get(r.id) ?? 0 }));
    },
    staleTime: 15 * 1000,
  });
}

export function useRoute(routeId: string | null) {
  return useQuery({
    queryKey: ['route', routeId],
    enabled: Boolean(routeId),
    queryFn: async (): Promise<{ route: RouteSchedule; stops: RouteStop[] }> => {
      const { data, error } = await supabase
        .from('route_schedules')
        .select('*')
        .eq('id', routeId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Rota não encontrada');
      const { data: stops, error: stopsErr } = await supabase
        .from('route_stops')
        .select('*')
        .eq('route_id', routeId!)
        .order('order_number', { ascending: true });
      if (stopsErr) throw stopsErr;
      return {
        route: data as unknown as RouteSchedule,
        stops: (stops ?? []) as unknown as RouteStop[],
      };
    },
  });
}

export type RouteConflict = {
  venda_id: string;
  venda_codigo: string | null;
  route_id: string;
  route_name: string;
  route_status: RouteStatus;
};

/** Notas já incluídas em rotas ativas (planeadas ou em curso). */
export async function findActiveRouteConflicts(vendaIds: string[]): Promise<RouteConflict[]> {
  if (vendaIds.length === 0) return [];
  const { data, error } = await supabase
    .from('route_stops')
    .select('venda_id, venda_codigo, route_id, route_schedules!inner(id, name, status)')
    .in('venda_id', vendaIds)
    .in('route_schedules.status', ACTIVE_ROUTE_STATUSES);
  if (error) throw error;
  type Row = {
    venda_id: string | null;
    venda_codigo: string | null;
    route_id: string;
    route_schedules: { name: string; status: string } | null;
  };
  return ((data ?? []) as unknown as Row[])
    .filter((r) => r.venda_id)
    .map((r) => ({
      venda_id: r.venda_id!,
      venda_codigo: r.venda_codigo,
      route_id: r.route_id,
      route_name: r.route_schedules?.name ?? 'Rota',
      route_status: (r.route_schedules?.status ?? 'pending') as RouteStatus,
    }));
}

export function useCreateRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      scheduledDate: string;
      departureAddress: string;
      plate: string;
      stops: {
        venda_id: string;
        venda_codigo: string;
        client_name: string;
        address: string | null;
        venda_data: string | null;
        venda_status: string | null;
      }[];
    }) => {
      const { data: user } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('route_schedules')
        .insert({
          name: input.name,
          scheduled_date: input.scheduledDate,
          status: 'pending',
          departure_address: input.departureAddress || null,
          notes: input.plate ? `Matrícula: ${input.plate}` : null,
          created_by: user.user?.id ?? null,
        })
        .select('id')
        .single();
      if (error) throw error;
      const routeId = data.id as string;
      const rows = input.stops.map((s, i) => ({ ...s, route_id: routeId, order_number: i + 1 }));
      if (rows.length > 0) {
        const { error: stopsErr } = await supabase.from('route_stops').insert(rows);
        if (stopsErr) throw stopsErr;
      }
      return routeId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['routes'] });
      toast.success('Rota criada');
    },
    onError: (e) => toast.error('Erro ao criar rota: ' + mapDatabaseError(e)),
  });
}

export function useAddRouteStops() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      routeId: string;
      stops: {
        venda_id: string;
        venda_codigo: string;
        client_name: string;
        address: string | null;
        venda_data: string | null;
        venda_status: string | null;
      }[];
    }) => {
      if (input.stops.length === 0) return 0;
      const { data: existing, error: exErr } = await supabase
        .from('route_stops')
        .select('order_number')
        .eq('route_id', input.routeId)
        .order('order_number', { ascending: false })
        .limit(1);
      if (exErr) throw exErr;
      const start = existing?.[0]?.order_number ?? 0;
      const rows = input.stops.map((s, i) => ({
        ...s,
        route_id: input.routeId,
        order_number: start + i + 1,
      }));
      const { error } = await supabase.from('route_stops').insert(rows);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (n, v) => {
      qc.invalidateQueries({ queryKey: ['route', v.routeId] });
      qc.invalidateQueries({ queryKey: ['routes'] });
      if (n) toast.success(`${n} nota(s) adicionada(s) à rota`);
    },
    onError: (e) => toast.error('Erro ao adicionar nota: ' + mapDatabaseError(e)),
  });
}

export function useUpdateRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      status?: RouteStatus;
      name?: string;
      scheduled_date?: string;
      departure_address?: string | null;
      notes?: string | null;
    }) => {
      const { id, ...patch } = input;
      const { error } = await supabase.from('route_schedules').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['routes'] });
      qc.invalidateQueries({ queryKey: ['route', v.id] });
      toast.success('Rota atualizada');
    },
    onError: (e) => toast.error('Erro ao atualizar rota: ' + mapDatabaseError(e)),
  });
}

export function useDeleteRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('route_schedules').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['routes'] });
      toast.success('Rota eliminada');
    },
    onError: (e) => toast.error('Erro ao eliminar rota: ' + mapDatabaseError(e)),
  });
}

export function useRemoveRouteStop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { routeId: string; stopId: string }) => {
      const { error } = await supabase.from('route_stops').delete().eq('id', input.stopId);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['route', v.routeId] });
      qc.invalidateQueries({ queryKey: ['routes'] });
      toast.success('Nota removida da rota');
    },
    onError: (e) => toast.error('Erro ao remover nota: ' + mapDatabaseError(e)),
  });
}

export function useReorderRouteStops() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { routeId: string; orderedIds: string[] }) => {
      for (let i = 0; i < input.orderedIds.length; i++) {
        const { error } = await supabase
          .from('route_stops')
          .update({ order_number: i + 1 })
          .eq('id', input.orderedIds[i]);
        if (error) throw error;
      }
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['route', v.routeId] }),
    onError: (e) => toast.error('Erro ao reordenar: ' + mapDatabaseError(e)),
  });
}
