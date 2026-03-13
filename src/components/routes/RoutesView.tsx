import { useState } from 'react';
import { useRoutes, useRouteStops } from '@/hooks/useRoutes';
import { RoutesList } from './RoutesList';
import { RouteDetail } from './RouteDetail';
import { CreateRouteDialog } from './CreateRouteDialog';
import { Button } from '@/components/ui/button';
import { Plus, MapPin } from 'lucide-react';

export function RoutesView() {
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const { routes, isLoading, createRoute, deleteRoute, updateRouteStatus } = useRoutes();

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
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Nova Rota
        </Button>
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
    </div>
  );
}
