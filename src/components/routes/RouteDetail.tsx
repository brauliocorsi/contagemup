import { useState, useMemo } from 'react';
import { RouteSchedule } from '@/hooks/useRoutes';
import { useRouteStops } from '@/hooks/useRoutes';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Plus, MapPin, Navigation, Trash2, CheckCircle, Loader2, GripVertical, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { AddStopDialog } from './AddStopDialog';
import { RouteMap } from './RouteMap';

interface RouteDetailProps {
  route: RouteSchedule;
  onBack: () => void;
  onUpdateStatus: (status: string) => void;
}

const statusLabels: Record<string, string> = {
  pending: 'Pendente',
  in_progress: 'Em Curso',
  completed: 'Concluída',
  delivered: 'Entregue',
};

export function RouteDetail({ route, onBack, onUpdateStatus }: RouteDetailProps) {
  const [addStopOpen, setAddStopOpen] = useState(false);
  const [selectedVendaStatuses, setSelectedVendaStatuses] = useState<Set<string>>(new Set());
  const { stops, isLoading, addStop, removeStop, updateStopStatus, geocodePostalCode } = useRouteStops(route.id);

  const vendaStatuses = useMemo(() => {
    const set = new Set<string>();
    stops.forEach(s => {
      const vs = (s as any).venda_status;
      if (vs) set.add(vs);
    });
    return Array.from(set).sort();
  }, [stops]);

  const filteredStops = selectedVendaStatuses.size === 0
    ? stops
    : stops.filter(s => selectedVendaStatuses.has((s as any).venda_status || ''));

  const toggleVendaStatus = (status: string) => {
    setSelectedVendaStatuses(prev => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status); else next.add(status);
      return next;
    });
  };

  const handleAddStop = async (data: {
    client_name: string;
    address?: string;
    postal_code?: string;
    city?: string;
    venda_id?: string;
    venda_codigo?: string;
  }) => {
    let lat: number | null = null;
    let lon: number | null = null;

    if (data.postal_code) {
      const coords = await geocodePostalCode(data.postal_code, data.city);
      if (coords) {
        lat = coords.lat;
        lon = coords.lon;
      }
    }

    addStop.mutate({
      route_id: route.id,
      client_name: data.client_name,
      address: data.address || null,
      postal_code: data.postal_code || null,
      city: data.city || null,
      latitude: lat,
      longitude: lon,
      order_number: stops.length,
      venda_id: data.venda_id || null,
      venda_codigo: data.venda_codigo || null,
      venda_status: null,
      status: 'pending',
      notes: null,
    });
    setAddStopOpen(false);
  };

  const stopsWithCoords = stops.filter(s => s.latitude && s.longitude);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{route.name}</h1>
            <p className="text-sm text-muted-foreground">
              {format(new Date(route.scheduled_date + 'T00:00:00'), "dd 'de' MMMM yyyy", { locale: pt })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {route.status === 'pending' && (
            <Button variant="outline" onClick={() => onUpdateStatus('in_progress')}>
              <Navigation className="h-4 w-4 mr-1" />
              Iniciar Rota
            </Button>
          )}
          {route.status === 'in_progress' && (
            <Button onClick={() => onUpdateStatus('completed')}>
              <CheckCircle className="h-4 w-4 mr-1" />
              Concluir Rota
            </Button>
          )}
          <Button onClick={() => setAddStopOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Adicionar Paragem
          </Button>
        </div>
      </div>

      {/* Map */}
      {stopsWithCoords.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              Mapa da Rota ({stopsWithCoords.length} pontos)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="h-[400px] rounded-b-lg overflow-hidden">
              <RouteMap stops={stopsWithCoords} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stops list */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">
              Paragens ({filteredStops.length}{selectedVendaStatuses.size > 0 ? ` de ${stops.length}` : ''})
            </CardTitle>
          </div>
          {vendaStatuses.length > 0 && (
            <div className="flex gap-1.5 flex-wrap pt-2">
              <Badge
                variant={selectedVendaStatuses.size === 0 ? 'default' : 'outline'}
                className="text-xs cursor-pointer"
                onClick={() => setSelectedVendaStatuses(new Set())}
              >
                Todos
              </Badge>
              {vendaStatuses.map(status => {
                const count = stops.filter(s => (s as any).venda_status === status).length;
                return (
                  <Badge
                    key={status}
                    variant={selectedVendaStatuses.has(status) ? 'default' : 'outline'}
                    className="text-xs cursor-pointer"
                    onClick={() => toggleVendaStatus(status)}
                  >
                    {status} ({count})
                  </Badge>
                );
              })}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filteredStops.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {selectedVendaStatuses.size > 0 ? 'Nenhuma paragem com os estados selecionados.' : 'Nenhuma paragem adicionada. Adicione clientes à rota.'}
            </p>
          ) : (
            <div className="space-y-2">
              {filteredStops.map((stop, idx) => (
                <div
                  key={stop.id}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold shrink-0">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{stop.client_name}</p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      {stop.postal_code && <span>{stop.postal_code}</span>}
                      {(stop as any).freguesia && <span>• {(stop as any).freguesia}</span>}
                      {(stop as any).municipio && <span>• {(stop as any).municipio}</span>}
                      {!(stop as any).freguesia && stop.city && <span>• {stop.city}</span>}
                      {stop.address && <span>• {stop.address}</span>}
                    </div>
                    {stop.venda_codigo && (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <p className="text-xs text-muted-foreground">Venda: {stop.venda_codigo}</p>
                        {(stop as any).venda_status && (
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                            {(stop as any).venda_status}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge
                      variant={stop.status === 'delivered' ? 'default' : 'secondary'}
                      className="text-xs cursor-pointer"
                      onClick={() => {
                        const nextStatus = stop.status === 'pending' ? 'delivered' : 'pending';
                        updateStopStatus.mutate({ stopId: stop.id, status: nextStatus });
                      }}
                    >
                      {statusLabels[stop.status] || stop.status}
                    </Badge>
                    {stop.latitude && stop.longitude && (
                      <Badge variant="outline" className="text-xs">
                        <MapPin className="h-3 w-3 mr-1" />
                        GPS
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => removeStop.mutate(stop.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AddStopDialog
        open={addStopOpen}
        onOpenChange={setAddStopOpen}
        onSubmit={handleAddStop}
      />
    </div>
  );
}
