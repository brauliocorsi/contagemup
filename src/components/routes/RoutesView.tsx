import { useState } from 'react';
import { useRoutes } from '@/hooks/useRoutes';
import { useDeliveryRegions } from '@/hooks/useDeliveryRegions';
import { useQueryClient } from '@tanstack/react-query';
import { RoutesList } from './RoutesList';
import { RouteDetail } from './RouteDetail';
import { CreateRouteDialog } from './CreateRouteDialog';
import { RegionalRouteBuilder } from './RegionalRouteBuilder';
import { RegionsConfig } from './RegionsConfig';
import { WeeklyRouteOptimizer } from './WeeklyRouteOptimizer';
import { Button } from '@/components/ui/button';
import { Plus, MapPin, Route, Settings, Calendar } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';

type View = 'list' | 'regions' | 'optimizer';

export function RoutesView() {
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [view, setView] = useState<View>('list');
  const queryClient = useQueryClient();
  const { routes, isLoading, createRoute, deleteRoute, updateRouteStatus } = useRoutes();
  const { regions } = useDeliveryRegions();

  const handleCreateRegionalRoute = async (data: {
    name: string;
    scheduled_date: string;
    region_id?: string;
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
      freguesia?: string;
      municipio?: string;
      venda_status?: string;
      venda_data?: string;
    }[];
  }) => {
    try {
      const { data: routeData, error: routeError } = await supabase
        .from('route_schedules')
        .insert({
          name: data.name,
          scheduled_date: data.scheduled_date,
          region_id: data.region_id || null,
        })
        .select()
        .single();

      if (routeError) throw routeError;

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
        freguesia: stop.freguesia || null,
        municipio: stop.municipio || null,
        venda_status: stop.venda_status || null,
        venda_data: stop.venda_data || null,
        status: 'pending',
      }));

      const { error: stopsError } = await supabase
        .from('route_stops')
        .insert(stopsToInsert);

      if (stopsError) throw stopsError;

      toast.success(`Rota criada com ${data.stops.length} paragens!`);
      setBuilderOpen(false);
      queryClient.invalidateQueries({ queryKey: ['route-schedules'] });
      setSelectedRouteId(routeData.id);
    } catch (err: any) {
      toast.error('Erro ao criar rota: ' + err.message);
    }
  };

  if (view === 'regions') {
    return <RegionsConfig onBack={() => setView('list')} />;
  }

  if (view === 'optimizer') {
    return <WeeklyRouteOptimizer onBack={() => setView('list')} />;
  }

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
    <PageContainer>
      <PageHeader
        icon={<MapPin className="h-5 w-5" />}
        title="Agendamento de Rotas"
        description="Planeamento, otimização e execução de entregas"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setView('optimizer')}>
              <Calendar className="h-4 w-4 mr-1" />
              Vista Semanal
            </Button>
            <Button variant="outline" size="sm" onClick={() => setView('regions')}>
              <Settings className="h-4 w-4 mr-1" />
              Regiões
            </Button>
            <Button variant="outline" onClick={() => setBuilderOpen(true)}>
              <Route className="h-4 w-4 mr-1" />
              Rota Regional
            </Button>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Nova Rota
            </Button>
          </>
        }
      />

      <RoutesList
        routes={routes}
        isLoading={isLoading}
        onSelect={setSelectedRouteId}
        onDelete={(id) => deleteRoute.mutate(id)}
        regions={regions}
      />


      <CreateRouteDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSubmit={(data) => {
          createRoute.mutate(data);
          setCreateDialogOpen(false);
        }}
      />

      <RegionalRouteBuilder
        open={builderOpen}
        onOpenChange={setBuilderOpen}
        onCreateRoute={handleCreateRegionalRoute}
      />
    </PageContainer>
  );
}
