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
  departure_address: string | null;
  departure_postal_code: string | null;
  departure_lat: number | null;
  departure_lon: number | null;
  return_to_base: boolean;
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

  // Portuguese postal code district lat/lon ranges for validation
  const ptPostalRanges: Record<string, { minLat: number; maxLat: number; minLon: number; maxLon: number }> = {
    '1': { minLat: 38.6, maxLat: 38.85, minLon: -9.3, maxLon: -9.05 }, // Lisboa
    '2': { minLat: 38.4, maxLat: 39.5, minLon: -9.5, maxLon: -8.5 },   // Setúbal/Leiria
    '3': { minLat: 39.5, maxLat: 40.7, minLon: -8.8, maxLon: -7.3 },   // Coimbra/Aveiro
    '4': { minLat: 40.6, maxLat: 42.2, minLon: -8.9, maxLon: -7.3 },   // Porto/Braga/Viana
    '5': { minLat: 40.5, maxLat: 42.0, minLon: -8.3, maxLon: -6.1 },   // Vila Real/Bragança
    '6': { minLat: 39.0, maxLat: 41.0, minLon: -8.0, maxLon: -6.5 },   // Castelo Branco/Guarda
    '7': { minLat: 37.5, maxLat: 39.5, minLon: -8.8, maxLon: -7.0 },   // Évora/Beja
    '8': { minLat: 36.9, maxLat: 37.6, minLon: -9.0, maxLon: -7.3 },   // Faro
    '9': { minLat: 32.5, maxLat: 39.8, minLon: -17.3, maxLon: -16.2 }, // Madeira/Açores
  };

  const isValidCoordForPostalCode = (postalCode: string, lat: number, lon: number): boolean => {
    const prefix = postalCode.charAt(0);
    const range = ptPostalRanges[prefix];
    if (!range) return true; // unknown prefix, allow
    return lat >= range.minLat && lat <= range.maxLat && lon >= range.minLon && lon <= range.maxLon;
  };

  // Geocode postal code with strict PT postcode matching
  const geocodePostalCode = async (
    postalCode: string,
    city?: string,
    address?: string
  ): Promise<{ lat: number; lon: number; freguesia?: string; municipio?: string; provider?: string } | null> => {
    const match = postalCode.match(/(\d{4})[-\s]?(\d{3})/);
    if (!match) return null;
    const normalizedCp = `${match[1]}-${match[2]}`;
    const compactCp = `${match[1]}${match[2]}`;

    // 1) GeoAPI.pt (most accurate for PT)
    try {
      const geoResponse = await fetch(`https://json.geoapi.pt/cp/${normalizedCp}`);
      if (geoResponse.ok) {
        const geoData = await geoResponse.json();
        if (geoData && (geoData.centro || (geoData.latitude && geoData.longitude))) {
          const lat = geoData.centro?.[0] || parseFloat(geoData.latitude);
          const lon = geoData.centro?.[1] || parseFloat(geoData.longitude);
          if (isValidCoordForPostalCode(normalizedCp, lat, lon)) {
            return {
              lat, lon,
              freguesia: geoData.Localidade || geoData.Freguesia || geoData.freguesia || undefined,
              municipio: geoData.Concelho || geoData.concelho || geoData.Municipio || undefined,
              provider: 'GeoAPI.pt',
            };
          }
        }
      }
    } catch {
      // next fallback
    }

    // 2) Nominatim with postal code + country
    try {
      const searchQuery = `${normalizedCp}, Portugal`;
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&postalcode=${encodeURIComponent(normalizedCp)}&country=Portugal&limit=3&addressdetails=1`
      );
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        for (const item of data) {
          const lat = parseFloat(item.lat);
          const lon = parseFloat(item.lon);
          if (isValidCoordForPostalCode(normalizedCp, lat, lon)) {
            return {
              lat, lon,
              freguesia: item?.address?.suburb || item?.address?.village || item?.address?.town || undefined,
              municipio: item?.address?.city || item?.address?.county || undefined,
              provider: 'Nominatim',
            };
          }
        }
      }
    } catch {
      // next fallback
    }

    // 3) Zippopotam (postcode exact match)
    try {
      const cp4 = match[1]; // only first 4 digits
      const zipResponse = await fetch(`https://api.zippopotam.us/PT/${cp4}`);
      if (zipResponse.ok) {
        const zipData = await zipResponse.json();
        const place = zipData?.places?.[0];
        if (place?.latitude && place?.longitude) {
          const lat = parseFloat(place.latitude);
          const lon = parseFloat(place.longitude);
          if (isValidCoordForPostalCode(normalizedCp, lat, lon)) {
            return {
              lat, lon,
              municipio: place['place name'] || undefined,
              freguesia: undefined,
              provider: 'Zippopotam',
            };
          }
        }
      }
    } catch {
      // no more fallbacks
    }

    return null;
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
