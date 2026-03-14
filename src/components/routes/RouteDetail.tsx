import { useState, useMemo } from 'react';
import { RouteSchedule } from '@/hooks/useRoutes';
import { useRouteStops } from '@/hooks/useRoutes';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Plus, MapPin, Navigation, Trash2, CheckCircle, Loader2, GripVertical, Filter, FileText, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { AddStopDialog } from './AddStopDialog';
import { StopSaleDetailDialog } from './StopSaleDetailDialog';
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

const vendaStatusColors: Record<string, { bg: string; border: string; badge: string }> = {
  'Agendado Entrega': { bg: 'bg-blue-50 dark:bg-blue-950/30', border: 'border-blue-300 dark:border-blue-700', badge: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900 dark:text-blue-200 dark:border-blue-700' },
  'Em Produção': { bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-300 dark:border-amber-700', badge: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900 dark:text-amber-200 dark:border-amber-700' },
  'Pronto': { bg: 'bg-green-50 dark:bg-green-950/30', border: 'border-green-300 dark:border-green-700', badge: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900 dark:text-green-200 dark:border-green-700' },
  'Entregue': { bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-300 dark:border-emerald-700', badge: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900 dark:text-emerald-200 dark:border-emerald-700' },
  'Cancelada': { bg: 'bg-red-50 dark:bg-red-950/30', border: 'border-red-300 dark:border-red-700', badge: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900 dark:text-red-200 dark:border-red-700' },
  'Pendente': { bg: 'bg-orange-50 dark:bg-orange-950/30', border: 'border-orange-300 dark:border-orange-700', badge: 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900 dark:text-orange-200 dark:border-orange-700' },
};
const defaultVendaColor = { bg: 'bg-purple-50 dark:bg-purple-950/30', border: 'border-purple-300 dark:border-purple-700', badge: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900 dark:text-purple-200 dark:border-purple-700' };

export function RouteDetail({ route, onBack, onUpdateStatus }: RouteDetailProps) {
  const [addStopOpen, setAddStopOpen] = useState(false);
  const [selectedVendaStatuses, setSelectedVendaStatuses] = useState<Set<string>>(new Set());
  const [saleDetailOpen, setSaleDetailOpen] = useState(false);
  const [saleDetailVendaId, setSaleDetailVendaId] = useState<string | null>(null);
  const [saleDetailVendaCodigo, setSaleDetailVendaCodigo] = useState<string | null>(null);
  const { stops, isLoading, addStop, removeStop, updateStopStatus, geocodePostalCode } = useRouteStops(route.id);
  const queryClient = useQueryClient();
  const [reloading, setReloading] = useState(false);
  const [updatedStopIds, setUpdatedStopIds] = useState<Set<string>>(new Set());

  const handleReloadNotas = async () => {
    const stopsWithVenda = stops.filter(s => s.venda_id);
    if (stopsWithVenda.length === 0) {
      toast.info('Nenhuma paragem com venda associada');
      return;
    }

    setReloading(true);
    let updated = 0;
    try {
      for (const stop of stopsWithVenda) {
        try {
          const { data, error } = await supabase.functions.invoke('gestaoclick-venda-detail', {
            body: { venda_id: stop.venda_id },
          });
          if (error || !data) continue;

          const newStatus = data.situacao || null;
          const newData = data.data || null;

          const updatePayload: Record<string, string | null> = {};
          if (newStatus && newStatus !== stop.venda_status) updatePayload.venda_status = newStatus;
          if (newData && newData !== stop.venda_data) updatePayload.venda_data = newData;

          if (Object.keys(updatePayload).length > 0) {
            await supabase.from('route_stops').update(updatePayload).eq('id', stop.id);
            updated++;
          }
        } catch {
          // skip individual errors
        }
      }

      queryClient.invalidateQueries({ queryKey: ['route-stops', route.id] });
      toast.success(`${updated} paragem(ns) atualizada(s) de ${stopsWithVenda.length}`);
    } catch (err: any) {
      toast.error('Erro ao recarregar: ' + err.message);
    } finally {
      setReloading(false);
    }
  };

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
      venda_data: null,
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
          <Button variant="outline" onClick={handleReloadNotas} disabled={reloading}>
            {reloading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Recarregar Notas
          </Button>
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
              {filteredStops.map((stop, idx) => {
                const vs = (stop as any).venda_status as string | undefined;
                const color = vs ? (vendaStatusColors[vs] || defaultVendaColor) : null;
                return (
                <div
                  key={stop.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-colors ${
                    color ? `${color.bg} ${color.border}` : 'border bg-card hover:bg-accent/50'
                  }`}
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
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <p className="text-xs text-muted-foreground">Venda: {stop.venda_codigo}</p>
                        {(stop as any).venda_data && (
                          <span className="text-[10px] text-muted-foreground">📅 {(stop as any).venda_data}</span>
                        )}
                        {vs && (
                          <Badge variant="outline" className={`text-[10px] py-0 px-1.5 border ${color ? color.badge : ''}`}>
                            {vs}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                   <div className="flex items-center gap-1">
                    {stop.venda_id && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => {
                          setSaleDetailVendaId(stop.venda_id);
                          setSaleDetailVendaCodigo(stop.venda_codigo);
                          setSaleDetailOpen(true);
                        }}
                      >
                        <FileText className="h-3 w-3" />
                        Ver Nota
                      </Button>
                    )}
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
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <AddStopDialog
        open={addStopOpen}
        onOpenChange={setAddStopOpen}
        onSubmit={handleAddStop}
      />
      <StopSaleDetailDialog
        open={saleDetailOpen}
        onOpenChange={setSaleDetailOpen}
        vendaId={saleDetailVendaId}
        vendaCodigo={saleDetailVendaCodigo}
      />
    </div>
  );
}
