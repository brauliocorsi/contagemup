import { useState, useMemo, useEffect, useRef } from 'react';
import { RouteSchedule } from '@/hooks/useRoutes';
import { useRouteStops } from '@/hooks/useRoutes';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, Plus, MapPin, Navigation, Trash2, CheckCircle, Loader2, GripVertical, Filter, FileText, RefreshCw, Scissors, Home } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { AddStopDialog } from './AddStopDialog';
import { StopSaleDetailDialog } from './StopSaleDetailDialog';
import { SplitRouteDialog } from './SplitRouteDialog';
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

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function RouteDetail({ route, onBack, onUpdateStatus }: RouteDetailProps) {
  const [addStopOpen, setAddStopOpen] = useState(false);
  const [selectedVendaStatuses, setSelectedVendaStatuses] = useState<Set<string>>(new Set());
  const [saleDetailOpen, setSaleDetailOpen] = useState(false);
  const [saleDetailVendaId, setSaleDetailVendaId] = useState<string | null>(null);
  const [saleDetailVendaCodigo, setSaleDetailVendaCodigo] = useState<string | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const { stops, isLoading, addStop, removeStop, updateStopStatus, geocodePostalCode } = useRouteStops(route.id);
  const queryClient = useQueryClient();
  const [reloading, setReloading] = useState(false);
  const [updatedStopIds, setUpdatedStopIds] = useState<Set<string>>(new Set());
  const [splitOpen, setSplitOpen] = useState(false);
  const [departureAddress, setDepartureAddress] = useState(route.departure_address || '');
  const [departurePostalCode, setDeparturePostalCode] = useState(route.departure_postal_code || '');
  const [returnToBase, setReturnToBase] = useState(route.return_to_base || false);
  const [savingDeparture, setSavingDeparture] = useState(false);

  const departureLat = route.departure_lat;
  const departureLon = route.departure_lon;

  const handleSaveDeparture = async () => {
    setSavingDeparture(true);
    try {
      let lat: number | null = null;
      let lon: number | null = null;
      if (departurePostalCode) {
        const coords = await geocodePostalCode(departurePostalCode, undefined, departureAddress || undefined);
        if (coords) {
          lat = coords.lat;
          lon = coords.lon;
        }
      }
      const { error } = await supabase.from('route_schedules').update({
        departure_address: departureAddress || null,
        departure_postal_code: departurePostalCode || null,
        departure_lat: lat,
        departure_lon: lon,
        return_to_base: returnToBase,
      }).eq('id', route.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['route-schedules'] });
      toast.success('Ponto de saída guardado');
    } catch (err: any) {
      toast.error('Erro ao guardar: ' + err.message);
    } finally {
      setSavingDeparture(false);
    }
  };

  const handleToggleReturn = async (val: boolean) => {
    setReturnToBase(val);
    await supabase.from('route_schedules').update({ return_to_base: val }).eq('id', route.id);
    queryClient.invalidateQueries({ queryKey: ['route-schedules'] });
  };

  // Validate if coord matches postal code region (first digit)
  const isCoordSuspicious = (postalCode: string, lat: number | null, lon: number | null): boolean => {
    if (!lat || !lon || !postalCode) return false;
    const prefix = postalCode.charAt(0);
    // Simple check: 4xxx codes should be north of 40.5 lat
    if (prefix === '4' && lat < 40.5) return true;
    // 1xxx codes should be around Lisbon (38.6-38.85)
    if (prefix === '1' && (lat > 39.0 || lat < 38.5)) return true;
    return false;
  };

  // Auto-geocode stops without coordinates or with suspicious coords on load
  const autoGeocodedRef = useRef(false);
  useEffect(() => {
    if (isLoading || autoGeocodedRef.current || stops.length === 0) return;
    const needsGeocode = stops.filter(s =>
      s.postal_code && (
        !s.latitude || !s.longitude ||
        isCoordSuspicious(s.postal_code, s.latitude, s.longitude)
      )
    );
    if (needsGeocode.length === 0) return;
    autoGeocodedRef.current = true;
    (async () => {
      setGeocoding(true);
      let geocoded = 0;
      for (const stop of needsGeocode) {
        try {
          // Add delay between API calls to avoid rate limiting
          if (geocoded > 0) await new Promise(r => setTimeout(r, 300));
          const coords = await geocodePostalCode(stop.postal_code!, stop.city || undefined, stop.address || undefined);
          if (coords) {
            const updatePayload: Record<string, any> = { latitude: coords.lat, longitude: coords.lon };
            if (coords.freguesia) updatePayload.freguesia = coords.freguesia;
            if (coords.municipio) updatePayload.municipio = coords.municipio;
            await supabase.from('route_stops').update(updatePayload).eq('id', stop.id);
            geocoded++;
          }
        } catch { /* skip */ }
      }
      if (geocoded > 0) {
        queryClient.invalidateQueries({ queryKey: ['route-stops', route.id] });
        toast.success(`${geocoded} paragem(ns) geocodificada(s) automaticamente`);
      }
      setGeocoding(false);
    })();
  }, [isLoading, stops]);

  const handleSplitRoute = async (groups: { name: string; stops: any[] }[]) => {
    try {
      for (const group of groups) {
        const { data: newRoute, error: routeErr } = await supabase
          .from('route_schedules')
          .insert({
            name: group.name,
            scheduled_date: route.scheduled_date,
            notes: `Dividida de: ${route.name}`,
          })
          .select()
          .single();
        if (routeErr) throw routeErr;

        const stopsToInsert = group.stops.map((stop: any, idx: number) => ({
          route_id: newRoute.id,
          client_name: stop.client_name,
          address: stop.address || null,
          postal_code: stop.postal_code || null,
          city: stop.city || null,
          latitude: stop.latitude,
          longitude: stop.longitude,
          order_number: idx,
          venda_id: stop.venda_id || null,
          venda_codigo: stop.venda_codigo || null,
          freguesia: stop.freguesia || null,
          municipio: stop.municipio || null,
          venda_status: stop.venda_status || null,
          venda_data: stop.venda_data || null,
          status: 'pending',
        }));

        const { error: stopsErr } = await supabase.from('route_stops').insert(stopsToInsert);
        if (stopsErr) throw stopsErr;
      }

      // Delete original route stops and route
      await supabase.from('route_stops').delete().eq('route_id', route.id);
      await supabase.from('route_schedules').delete().eq('id', route.id);

      queryClient.invalidateQueries({ queryKey: ['route-schedules'] });
      queryClient.invalidateQueries({ queryKey: ['route-stops', route.id] });
      toast.success(`Rota dividida em ${groups.length} sub-rotas! Rota original eliminada.`);
      onBack();
    } catch (err: any) {
      toast.error('Erro ao dividir rota: ' + err.message);
    }
  };

  const handleReloadNotas = async () => {
    const stopsWithVenda = stops.filter(s => s.venda_id);
    if (stopsWithVenda.length === 0) {
      toast.info('Nenhuma paragem com venda associada');
      return;
    }

    setReloading(true);
    let updated = 0;
    const newlyUpdated = new Set<string>();
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
            newlyUpdated.add(stop.id);
          }
        } catch {
          // skip individual errors
        }
      }

      setUpdatedStopIds(newlyUpdated);
      queryClient.invalidateQueries({ queryKey: ['route-stops', route.id] });
      toast.success(`${updated} paragem(ns) atualizada(s) de ${stopsWithVenda.length}`);
    } catch (err: any) {
      toast.error('Erro ao recarregar: ' + err.message);
    } finally {
      setReloading(false);
    }
  };

  const handleGeocodeAll = async (forceAll = false) => {
    const targetStops = forceAll
      ? stops.filter(s => s.postal_code)
      : stops.filter(s => (!s.latitude || !s.longitude) && s.postal_code);
    if (targetStops.length === 0) {
      toast.info('Nenhuma paragem com código postal para geocodificar');
      return;
    }
    setGeocoding(true);
    let geocoded = 0;
    let failed = 0;
    const fallbackStops: { name: string; cp: string; provider: string }[] = [];
    const failedStops: { name: string; cp: string }[] = [];
    try {
      for (const stop of targetStops) {
        try {
          const coords = await geocodePostalCode(stop.postal_code!, stop.city || undefined, stop.address || undefined);
          if (coords) {
            const updatePayload: Record<string, any> = { latitude: coords.lat, longitude: coords.lon };
            if (coords.freguesia) updatePayload.freguesia = coords.freguesia;
            if (coords.municipio) updatePayload.municipio = coords.municipio;
            await supabase.from('route_stops').update(updatePayload).eq('id', stop.id);
            geocoded++;
            if (coords.provider && coords.provider !== 'GeoAPI.pt') {
              fallbackStops.push({ name: stop.client_name, cp: stop.postal_code!, provider: coords.provider });
            }
          } else {
            failed++;
            failedStops.push({ name: stop.client_name, cp: stop.postal_code! });
          }
        } catch {
          failed++;
          failedStops.push({ name: stop.client_name, cp: stop.postal_code! });
        }
      }
      queryClient.invalidateQueries({ queryKey: ['route-stops', route.id] });

      // Success summary
      toast.success(`${geocoded} de ${targetStops.length} paragem(ns) geocodificada(s)`);

      // Fallback warning
      if (fallbackStops.length > 0) {
        toast.warning(
          `${fallbackStops.length} paragem(ns) usaram fonte alternativa (menos precisa):\n${fallbackStops.map(s => `• ${s.name} (${s.cp}) → ${s.provider}`).join('\n')}`,
          { duration: 10000 }
        );
      }

      // Failed stops alert
      if (failedStops.length > 0) {
        toast.error(
          `${failedStops.length} paragem(ns) ficaram sem coordenadas:\n${failedStops.map(s => `• ${s.name} (${s.cp})`).join('\n')}`,
          { duration: 10000 }
        );
      }
    } catch (err: any) {
      toast.error('Erro ao geocodificar: ' + err.message);
    } finally {
      setGeocoding(false);
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
      const coords = await geocodePostalCode(data.postal_code, data.city, data.address);
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

  const totalDistanceKm = useMemo(() => {
    let total = 0;
    // Departure to first stop
    if (departureLat && departureLon && stopsWithCoords.length > 0) {
      const first = stopsWithCoords[0];
      total += haversineKm(departureLat, departureLon, first.latitude!, first.longitude!);
    }
    // Between stops
    for (let i = 0; i < stopsWithCoords.length - 1; i++) {
      const a = stopsWithCoords[i];
      const b = stopsWithCoords[i + 1];
      total += haversineKm(a.latitude!, a.longitude!, b.latitude!, b.longitude!);
    }
    // Return to base
    if (returnToBase && departureLat && departureLon && stopsWithCoords.length > 0) {
      const last = stopsWithCoords[stopsWithCoords.length - 1];
      total += haversineKm(last.latitude!, last.longitude!, departureLat, departureLon);
    }
    return total;
  }, [stopsWithCoords, departureLat, departureLon, returnToBase]);

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
              {totalDistanceKm > 0 && (
                <span className="ml-2 font-medium text-foreground">
                  • {totalDistanceKm.toFixed(1)} km total
                </span>
              )}
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
          {stops.some(s => s.postal_code) && (
            <Button variant="outline" onClick={() => handleGeocodeAll(stops.every(s => s.latitude && s.longitude))} disabled={geocoding}>
              {geocoding ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <MapPin className="h-4 w-4 mr-1" />}
              {stops.some(s => (!s.latitude || !s.longitude) && s.postal_code) ? 'Geocodificar' : 'Regeocodificar'}
            </Button>
          )}
          {stops.length >= 2 && (
            <Button variant="outline" onClick={() => setSplitOpen(true)}>
              <Scissors className="h-4 w-4 mr-1" />
              Dividir Rota
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
              {totalDistanceKm > 0 && (
                <Badge variant="secondary" className="text-xs ml-2">
                  <Navigation className="h-3 w-3 mr-1" />
                  {totalDistanceKm.toFixed(1)} km
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="h-[400px] rounded-b-lg overflow-hidden">
              <RouteMap stops={stopsWithCoords} departureLat={departureLat} departureLon={departureLon} departureLabel={departureAddress || departurePostalCode || 'Base'} returnToBase={returnToBase} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Departure / Return config */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Home className="h-5 w-5 text-primary" />
            Ponto de Saída / Volta
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div>
              <Label className="text-xs">Morada de Saída</Label>
              <Input value={departureAddress} onChange={e => setDepartureAddress(e.target.value)} placeholder="Ex: Rua da Fábrica, 123" className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Código Postal</Label>
              <Input value={departurePostalCode} onChange={e => setDeparturePostalCode(e.target.value)} placeholder="Ex: 4400-001" className="h-9" />
            </div>
            <div className="flex items-center gap-3">
              <Button size="sm" onClick={handleSaveDeparture} disabled={savingDeparture}>
                {savingDeparture ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <MapPin className="h-4 w-4 mr-1" />}
                Guardar
              </Button>
              <div className="flex items-center gap-2">
                <Switch checked={returnToBase} onCheckedChange={handleToggleReturn} id="return-toggle" />
                <Label htmlFor="return-toggle" className="text-xs cursor-pointer">Volta ao ponto de saída</Label>
              </div>
            </div>
          </div>
          {departureLat && departureLon && (
            <div className="mt-2 flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                <MapPin className="h-3 w-3 mr-1" />
                GPS: {departureLat.toFixed(4)}, {departureLon.toFixed(4)}
              </Badge>
              {stopsWithCoords.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  <Navigation className="h-3 w-3 mr-1" />
                  {haversineKm(departureLat, departureLon, stopsWithCoords[0].latitude!, stopsWithCoords[0].longitude!).toFixed(1)} km até 1ª paragem
                </Badge>
              )}
              {returnToBase && stopsWithCoords.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  <Navigation className="h-3 w-3 mr-1" />
                  {haversineKm(stopsWithCoords[stopsWithCoords.length - 1].latitude!, stopsWithCoords[stopsWithCoords.length - 1].longitude!, departureLat, departureLon).toFixed(1)} km volta
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

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
                const prevStop = idx > 0 ? filteredStops[idx - 1] : null;
                let distKm: number | null = null;
                let distLabel = '';
                if (idx === 0 && departureLat && departureLon && stop.latitude && stop.longitude) {
                  distKm = haversineKm(departureLat, departureLon, stop.latitude, stop.longitude);
                  distLabel = '🏠 → ';
                } else if (prevStop && prevStop.latitude && prevStop.longitude && stop.latitude && stop.longitude) {
                  distKm = haversineKm(prevStop.latitude, prevStop.longitude, stop.latitude, stop.longitude);
                }
                return (
                <div key={stop.id}>
                  {distKm !== null && (
                    <div className="flex items-center justify-center py-1">
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Navigation className="h-3 w-3" />
                        {distLabel}{distKm.toFixed(1)} km
                      </span>
                    </div>
                  )}
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
                    <div className="flex items-center gap-1.5">
                      <p className="font-medium truncate">{stop.client_name}</p>
                      {updatedStopIds.has(stop.id) && (
                        <Badge className="text-[10px] py-0 px-1.5 bg-emerald-500 text-white border-0 animate-pulse">
                          Nova
                        </Badge>
                      )}
                    </div>
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
                </div>
                );
              })}
              {/* Return to base distance */}
              {returnToBase && departureLat && departureLon && filteredStops.length > 0 && (() => {
                const lastStop = filteredStops[filteredStops.length - 1];
                if (!lastStop.latitude || !lastStop.longitude) return null;
                const returnDist = haversineKm(lastStop.latitude, lastStop.longitude, departureLat, departureLon);
                return (
                  <div className="flex items-center justify-center py-1">
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Navigation className="h-3 w-3" />
                      → 🏠 {returnDist.toFixed(1)} km (volta)
                    </span>
                  </div>
                );
              })()}
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
      <SplitRouteDialog
        open={splitOpen}
        onOpenChange={setSplitOpen}
        stops={stops}
        routeName={route.name}
        scheduledDate={route.scheduled_date}
        onSplit={handleSplitRoute}
      />
    </div>
  );
}
