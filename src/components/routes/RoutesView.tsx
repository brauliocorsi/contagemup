import { useState } from 'react';
import { useRoutes, useRouteStops } from '@/hooks/useRoutes';
import { useQueryClient } from '@tanstack/react-query';
import { RoutesList } from './RoutesList';
import { RouteDetail } from './RouteDetail';
import { CreateRouteDialog } from './CreateRouteDialog';
import { SuggestRouteDialog } from './SuggestRouteDialog';
import { Button } from '@/components/ui/button';
import { Plus, MapPin, Route } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function RoutesView() {
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [suggestDialogOpen, setSuggestDialogOpen] = useState(false);
  const queryClient = useQueryClient();
  const { routes, isLoading, createRoute, deleteRoute, updateRouteStatus } = useRoutes();

  const handleSuggestRoute = async (data: {
    name: string;
    scheduled_date: string;
    stops: {
      client_name: string;
      address: string;
      postal_code: string;
      city: string;
      latitude: number | null;
      longitude: number | null;
      order_number: number;
      venda_id: string | null;
      venda_codigo: string | null;
    }[];
  }) => {
    try {
      // Create the route
      const { data: routeData, error: routeError } = await supabase
        .from('route_schedules')
        .insert({ name: data.name, scheduled_date: data.scheduled_date })
        .select()
        .single();

      if (routeError) throw routeError;

      // Insert all stops
      const stopsToInsert = data.stops.map(stop => ({
        route_id: routeData.id,
        client_name: stop.client_name,
        address: stop.address || null,
        postal_code: stop.postal_code || null,
        city: stop.city || null,
        latitude: stop.latitude,
        longitude: stop.longitude,
        order_number: stop.order_number,
        venda_id: stop.venda_id,
        venda_codigo: stop.venda_codigo,
        status: 'pending',
      }));

      const { error: stopsError } = await supabase
        .from('route_stops')
        .insert(stopsToInsert);

      if (stopsError) throw stopsError;

      toast.success(`Rota criada com ${data.stops.length} paragens!`);
      setSuggestDialogOpen(false);

      // Refresh routes and open the new one
      queryClient.invalidateQueries({ queryKey: ['route-schedules'] });
      setSelectedRouteId(routeData.id);
    } catch (err: any) {
      toast.error('Erro ao criar rota: ' + err.message);
    }
  };

  if (selectedRouteId) {
    const route = routes.find(r => r.id === selectedRouteId);
    if (route) {
      return (
        <RouteDetail
          route={route}
          onBack={() => setSelectedRouteId(null)}
          onUpdateStatus={(status) => updateRouteStatus.mutate({ routeId: route.id, status })}
        />
      );
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Agendamento de Rotas</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setSuggestDialogOpen(true)}>
            <Route className="h-4 w-4 mr-1" />
            Sugerir Rota (Vendas)
          </Button>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Nova Rota
          </Button>
        </div>
      </div>

      <RoutesList
        routes={routes}
        isLoading={isLoading}
        onSelect={setSelectedRouteId}
        onDelete={(id) => deleteRoute.mutate(id)}
      />

      <CreateRouteDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSubmit={(data) => {
          createRoute.mutate(data);
          setCreateDialogOpen(false);
        }}
      />

      <SuggestRouteDialog
        open={suggestDialogOpen}
        onOpenChange={setSuggestDialogOpen}
        onCreateRoute={handleSuggestRoute}
      />
    </div>
  );
}
