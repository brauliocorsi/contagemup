import { useState } from 'react';
import { RouteSchedule } from '@/hooks/useRoutes';
import { DeliveryRegion } from '@/hooks/useDeliveryRegions';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, MapPin, Trash2, Loader2, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';

interface RoutesListProps {
  routes: RouteSchedule[];
  isLoading: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  regions?: DeliveryRegion[];
}

const statusLabels: Record<string, string> = {
  pending: 'Pendente',
  in_progress: 'Em Curso',
  completed: 'Concluída',
  cancelled: 'Cancelada',
};

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  in_progress: 'bg-blue-100 text-blue-800 border-blue-300',
  completed: 'bg-green-100 text-green-800 border-green-300',
  cancelled: 'bg-red-100 text-red-800 border-red-300',
};

export function RoutesList({ routes, isLoading, onSelect, onDelete, regions = [] }: RoutesListProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (routes.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <MapPin className="h-12 w-12 mb-4 opacity-50" />
          <p className="text-lg font-medium">Nenhuma rota agendada</p>
          <p className="text-sm">Crie uma nova rota para começar a planear entregas</p>
        </CardContent>
      </Card>
    );
  }

  const getRegion = (route: RouteSchedule) => {
    const regionId = (route as any).region_id;
    return regionId ? regions.find(r => r.id === regionId) : null;
  };

  return (
    <div className="grid gap-3">
      {routes.map((route) => {
        const region = getRegion(route);
        return (
          <Card
            key={route.id}
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => onSelect(route.id)}
            style={region ? { borderLeftWidth: 4, borderLeftColor: region.color } : undefined}
          >
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    {format(new Date(route.scheduled_date + 'T00:00:00'), "dd MMM yyyy", { locale: pt })}
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{route.name}</h3>
                    {region && (
                      <Badge
                        className="text-[10px] py-0 px-1.5"
                        style={{ backgroundColor: region.color, color: 'white' }}
                      >
                        {region.name}
                      </Badge>
                    )}
                  </div>
                  {route.notes && (
                    <p className="text-sm text-muted-foreground">{route.notes}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={statusColors[route.status] || ''}>
                  {statusLabels[route.status] || route.status}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(route.id);
                  }}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
