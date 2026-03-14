import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface RouteSchedule {
  id: string;
  name: string;
  scheduled_date: string;
  status: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  stops?: RouteStop[];
}

export interface RouteStop {
  id: string;
  route_id: string;
  client_name: string;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  order_number: number;
  venda_id: string | null;
  venda_codigo: string | null;
  status: string;
  notes: string | null;
  venda_status: string | null;
  venda_data: string | null;
  created_at: string;
  updated_at: string;
}

export interface ERPClient {
  id: string;
  nome: string;
  endereco: string;
  numero: string;
  bairro: string;
  cidade: string;
  estado: string;
  cep: string;
  complemento: string;
  email: string;
  telefone: string;
  pais: string;
}

export function useRoutes() {
  const queryClient = useQueryClient();

  const { data: routes = [], isLoading } = useQuery({
    queryKey: ['route-schedules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('route_schedules')
        .select('*')
        .order('scheduled_date', { ascending: false });
      if (error) throw error;
      return data as RouteSchedule[];
    },
  });

  const { data: clients = [], isLoading: clientsLoading, refetch: refetchClients } = useQuery({
    queryKey: ['erp-clients'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('gestaoclick-clients');
      if (error) throw error;
      return (data?.clients || []) as ERPClient[];
    },
    enabled: false, // Only fetch on demand
  });

  const createRoute = useMutation({
    mutationFn: async (route: { name: string; scheduled_date: string; notes?: string }) => {
      const { data, error } = await supabase
        .from('route_schedules')
        .insert(route)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['route-schedules'] });
      toast.success('Rota criada com sucesso');
    },
    onError: (err: any) => toast.error('Erro ao criar rota: ' + err.message),
  });

  const deleteRoute = useMutation({
    mutationFn: async (routeId: string) => {
      const { error } = await supabase.from('route_schedules').delete().eq('id', routeId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['route-schedules'] });
      toast.success('Rota eliminada');
    },
    onError: (err: any) => toast.error('Erro ao eliminar rota: ' + err.message),
  });

  const updateRouteStatus = useMutation({
    mutationFn: async ({ routeId, status }: { routeId: string; status: string }) => {
      const { error } = await supabase.from('route_schedules').update({ status }).eq('id', routeId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['route-schedules'] });
    },
  });

  return {
    routes,
    isLoading,
    clients,
    clientsLoading,
    refetchClients,
    createRoute,
    deleteRoute,
    updateRouteStatus,
  };
}

export function useRouteStops(routeId: string | null) {
  const queryClient = useQueryClient();

  const { data: stops = [], isLoading } = useQuery({
    queryKey: ['route-stops', routeId],
    queryFn: async () => {
      if (!routeId) return [];
      const { data, error } = await supabase
        .from('route_stops')
        .select('*')
        .eq('route_id', routeId)
        .order('order_number', { ascending: true });
      if (error) throw error;
      return data as RouteStop[];
    },
    enabled: !!routeId,
  });

  const addStop = useMutation({
    mutationFn: async (stop: Omit<RouteStop, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('route_stops')
        .insert(stop)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['route-stops', routeId] });
      toast.success('Paragem adicionada');
    },
    onError: (err: any) => toast.error('Erro ao adicionar paragem: ' + err.message),
  });

  const removeStop = useMutation({
    mutationFn: async (stopId: string) => {
      const { error } = await supabase.from('route_stops').delete().eq('id', stopId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['route-stops', routeId] });
      toast.success('Paragem removida');
    },
    onError: (err: any) => toast.error('Erro ao remover paragem: ' + err.message),
  });

  const updateStopStatus = useMutation({
    mutationFn: async ({ stopId, status }: { stopId: string; status: string }) => {
      const { error } = await supabase.from('route_stops').update({ status }).eq('id', stopId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['route-stops', routeId] });
    },
  });

  const updateStopOrder = useMutation({
    mutationFn: async (updates: { id: string; order_number: number }[]) => {
      for (const u of updates) {
        const { error } = await supabase
          .from('route_stops')
          .update({ order_number: u.order_number })
          .eq('id', u.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['route-stops', routeId] });
    },
  });

  // Geocode postal code using Nominatim (free, OpenStreetMap)
  const geocodePostalCode = async (postalCode: string, city?: string): Promise<{ lat: number; lon: number } | null> => {
    try {
      const query = city ? `${postalCode}, ${city}, Portugal` : `${postalCode}, Portugal`;
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`
      );
      const data = await response.json();
      if (data && data.length > 0) {
        return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
      }
      return null;
    } catch {
      return null;
    }
  };

  return {
    stops,
    isLoading,
    addStop,
    removeStop,
    updateStopStatus,
    updateStopOrder,
    geocodePostalCode,
  };
}
