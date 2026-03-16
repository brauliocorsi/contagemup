import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowRight, Check, MapPin, MoveRight, Zap, Loader2 } from 'lucide-react';
import { RouteSchedule, RouteStop } from '@/hooks/useRoutes';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface WeeklyOptimizationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  routes: RouteSchedule[];
  stopsByRoute: Map<string, RouteStop[]>;
}

interface StopMove {
  stop: RouteStop;
  fromRouteId: string;
  fromRouteName: string;
  toRouteId: string;
  toRouteName: string;
}

interface RouteOptimization {
  routeId: string;
  routeName: string;
  originalOrder: RouteStop[];
  optimizedOrder: RouteStop[];
  originalDistance: number;
  optimizedDistance: number;
  departure: { lat: number; lon: number } | null;
  returnToBase: boolean;
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calcRouteDistance(stops: RouteStop[], departure: { lat: number; lon: number } | null, returnToBase: boolean): number {
  const withCoords = stops.filter(s => s.latitude != null && s.longitude != null);
  if (withCoords.length === 0) return 0;
  let dist = 0;
  let prevLat = departure?.lat ?? withCoords[0].latitude!;
  let prevLon = departure?.lon ?? withCoords[0].longitude!;

  if (departure) {
    dist += haversineDistance(prevLat, prevLon, withCoords[0].latitude!, withCoords[0].longitude!);
    prevLat = withCoords[0].latitude!;
    prevLon = withCoords[0].longitude!;
  }

  for (let i = 1; i < withCoords.length; i++) {
    dist += haversineDistance(prevLat, prevLon, withCoords[i].latitude!, withCoords[i].longitude!);
    prevLat = withCoords[i].latitude!;
    prevLon = withCoords[i].longitude!;
  }

  if (returnToBase && departure) {
    dist += haversineDistance(prevLat, prevLon, departure.lat, departure.lon);
  }
  return dist;
}

function nearestNeighborTSP(stops: RouteStop[], departure: { lat: number; lon: number } | null): RouteStop[] {
  const withCoords = stops.filter(s => s.latitude != null && s.longitude != null);
  const withoutCoords = stops.filter(s => s.latitude == null || s.longitude == null);

  if (withCoords.length <= 1) return [...withCoords, ...withoutCoords];

  const visited = new Set<string>();
  const result: RouteStop[] = [];
  let currentLat = departure?.lat ?? withCoords[0].latitude!;
  let currentLon = departure?.lon ?? withCoords[0].longitude!;

  while (visited.size < withCoords.length) {
    let nearest: RouteStop | null = null;
    let nearestDist = Infinity;

    for (const stop of withCoords) {
      if (visited.has(stop.id)) continue;
      const d = haversineDistance(currentLat, currentLon, stop.latitude!, stop.longitude!);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = stop;
      }
    }

    if (nearest) {
      visited.add(nearest.id);
      result.push(nearest);
      currentLat = nearest.latitude!;
      currentLon = nearest.longitude!;
    }
  }

  return [...result, ...withoutCoords];
}

function suggestMoves(
  routes: RouteSchedule[],
  stopsByRoute: Map<string, RouteStop[]>
): StopMove[] {
  const moves: StopMove[] = [];
  const routesByDay = new Map<string, RouteSchedule[]>();

  routes.forEach(r => {
    const day = r.scheduled_date;
    if (!routesByDay.has(day)) routesByDay.set(day, []);
    routesByDay.get(day)!.push(r);
  });

  for (const [, dayRoutes] of routesByDay) {
    if (dayRoutes.length < 2) continue;

    for (let i = 0; i < dayRoutes.length; i++) {
      const routeA = dayRoutes[i];
      const stopsA = stopsByRoute.get(routeA.id) || [];

      for (const stopA of stopsA) {
        if (!stopA.latitude || !stopA.longitude) continue;

        let bestRoute: RouteSchedule | null = null;
        let bestAvgDist = Infinity;

        // Check proximity to other routes' stops
        for (let j = 0; j < dayRoutes.length; j++) {
          if (i === j) continue;
          const routeB = dayRoutes[j];
          const stopsB = (stopsByRoute.get(routeB.id) || []).filter(s => s.latitude && s.longitude);
          if (stopsB.length === 0) continue;

          const avgDist = stopsB.reduce((sum, s) =>
            sum + haversineDistance(stopA.latitude!, stopA.longitude!, s.latitude!, s.longitude!), 0
          ) / stopsB.length;

          if (avgDist < bestAvgDist) {
            bestAvgDist = avgDist;
            bestRoute = routeB;
          }
        }

        // Calculate avg distance to own route
        const ownStops = stopsA.filter(s => s.id !== stopA.id && s.latitude && s.longitude);
        const ownAvgDist = ownStops.length > 0
          ? ownStops.reduce((sum, s) =>
            sum + haversineDistance(stopA.latitude!, stopA.longitude!, s.latitude!, s.longitude!), 0
          ) / ownStops.length
          : Infinity;

        // Only suggest move if significantly closer to other route (>30% improvement)
        if (bestRoute && bestAvgDist < ownAvgDist * 0.7 && bestAvgDist < 15) {
          moves.push({
            stop: stopA,
            fromRouteId: routeA.id,
            fromRouteName: routeA.name,
            toRouteId: bestRoute.id,
            toRouteName: bestRoute.name,
          });
        }
      }
    }
  }

  return moves;
}

export function WeeklyOptimizationDialog({ open, onOpenChange, routes, stopsByRoute }: WeeklyOptimizationDialogProps) {
  const [applying, setApplying] = useState(false);
  const queryClient = useQueryClient();

  const routeMap = useMemo(() => {
    const m = new Map<string, RouteSchedule>();
    routes.forEach(r => m.set(r.id, r));
    return m;
  }, [routes]);

  const moves = useMemo(() => suggestMoves(routes, stopsByRoute), [routes, stopsByRoute]);

  // Build optimized stops map (after moves applied)
  const optimizedStopsByRoute = useMemo(() => {
    const map = new Map<string, RouteStop[]>();
    // Clone current
    stopsByRoute.forEach((stops, routeId) => {
      map.set(routeId, [...stops]);
    });
    // Apply moves
    for (const move of moves) {
      const fromStops = map.get(move.fromRouteId) || [];
      map.set(move.fromRouteId, fromStops.filter(s => s.id !== move.stop.id));
      const toStops = map.get(move.toRouteId) || [];
      toStops.push({ ...move.stop, route_id: move.toRouteId });
      map.set(move.toRouteId, toStops);
    }
    return map;
  }, [stopsByRoute, moves]);

  const optimizations = useMemo<RouteOptimization[]>(() => {
    return routes.map(route => {
      const departure = (route.departure_lat != null && route.departure_lon != null)
        ? { lat: route.departure_lat, lon: route.departure_lon }
        : null;
      const originalStops = stopsByRoute.get(route.id) || [];
      const afterMoveStops = optimizedStopsByRoute.get(route.id) || [];
      const optimizedOrder = nearestNeighborTSP(afterMoveStops, departure);

      return {
        routeId: route.id,
        routeName: route.name,
        originalOrder: originalStops,
        optimizedOrder,
        originalDistance: calcRouteDistance(originalStops, departure, route.return_to_base),
        optimizedDistance: calcRouteDistance(optimizedOrder, departure, route.return_to_base),
        departure,
        returnToBase: route.return_to_base,
      };
    }).filter(o => o.originalOrder.length > 0 || o.optimizedOrder.length > 0);
  }, [routes, stopsByRoute, optimizedStopsByRoute]);

  const totalBefore = optimizations.reduce((s, o) => s + o.originalDistance, 0);
  const totalAfter = optimizations.reduce((s, o) => s + o.optimizedDistance, 0);
  const savings = totalBefore - totalAfter;

  const handleApply = async () => {
    setApplying(true);
    try {
      // 1. Move stops between routes
      for (const move of moves) {
        const { error } = await supabase
          .from('route_stops')
          .update({ route_id: move.toRouteId })
          .eq('id', move.stop.id);
        if (error) throw error;
      }

      // 2. Update order_number for all optimized routes
      for (const opt of optimizations) {
        for (let i = 0; i < opt.optimizedOrder.length; i++) {
          const stop = opt.optimizedOrder[i];
          const { error } = await supabase
            .from('route_stops')
            .update({ order_number: i + 1 })
            .eq('id', stop.id);
          if (error) throw error;
        }
      }

      queryClient.invalidateQueries({ queryKey: ['route-schedules'] });
      queryClient.invalidateQueries({ queryKey: ['route-stops'] });
      queryClient.invalidateQueries({ queryKey: ['week-stops'] });
      toast.success(`Otimização aplicada! Economia estimada: ${savings.toFixed(1)} km`);
      onOpenChange(false);
    } catch (err: any) {
      toast.error('Erro ao aplicar otimização: ' + err.message);
    } finally {
      setApplying(false);
    }
  };

  const hasChanges = moves.length > 0 || optimizations.some(o => {
    if (o.originalOrder.length < 2) return false;
    return o.originalOrder.some((s, i) => o.optimizedOrder[i]?.id !== s.id);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Otimização Semanal de Rotas
          </DialogTitle>
          <DialogDescription>
            Análise de proximidade geográfica e reordenação por trajeto mais curto.
          </DialogDescription>
        </DialogHeader>

        {/* Summary */}
        <div className="flex gap-3 flex-wrap">
          <Badge variant="outline" className="text-sm py-1 px-3">
            Antes: ~{totalBefore.toFixed(0)} km
          </Badge>
          <Badge variant="outline" className="text-sm py-1 px-3 text-primary border-primary">
            Depois: ~{totalAfter.toFixed(0)} km
          </Badge>
          {savings > 0 && (
            <Badge className="text-sm py-1 px-3 bg-green-600">
              Economia: ~{savings.toFixed(1)} km ({totalBefore > 0 ? ((savings / totalBefore) * 100).toFixed(0) : 0}%)
            </Badge>
          )}
          {moves.length > 0 && (
            <Badge variant="secondary" className="text-sm py-1 px-3">
              {moves.length} transferência(s)
            </Badge>
          )}
        </div>

        <ScrollArea className="max-h-[50vh]">
          <div className="space-y-4 pr-4">
            {/* Suggested moves */}
            {moves.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <MoveRight className="h-4 w-4" />
                    Transferências Sugeridas
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {moves.map((move, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm p-2 rounded-md bg-muted/50">
                      <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="font-medium truncate">{move.stop.client_name}</span>
                      <span className="text-muted-foreground shrink-0">{move.fromRouteName}</span>
                      <ArrowRight className="h-3 w-3 text-primary shrink-0" />
                      <span className="text-primary font-medium shrink-0">{move.toRouteName}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Route optimizations */}
            {optimizations.map(opt => {
              const saved = opt.originalDistance - opt.optimizedDistance;
              const orderChanged = opt.originalOrder.some((s, i) => opt.optimizedOrder[i]?.id !== s.id);
              const stopsChanged = opt.originalOrder.length !== opt.optimizedOrder.length;

              if (!orderChanged && !stopsChanged && saved < 0.5) return null;

              return (
                <Card key={opt.routeId}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span>{opt.routeName}</span>
                      <div className="flex gap-2">
                        <Badge variant="outline" className="text-xs">
                          {opt.originalDistance.toFixed(0)} km
                        </Badge>
                        <ArrowRight className="h-3 w-3 self-center" />
                        <Badge variant="outline" className="text-xs text-primary border-primary">
                          {opt.optimizedDistance.toFixed(0)} km
                        </Badge>
                        {saved > 0.5 && (
                          <Badge className="text-xs bg-green-600">-{saved.toFixed(0)} km</Badge>
                        )}
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <p className="font-medium text-muted-foreground mb-1">Ordem Atual</p>
                        <ol className="space-y-0.5 list-decimal list-inside">
                          {opt.originalOrder.map(s => (
                            <li key={s.id} className="truncate">{s.client_name}</li>
                          ))}
                        </ol>
                      </div>
                      <div>
                        <p className="font-medium text-primary mb-1">Ordem Otimizada</p>
                        <ol className="space-y-0.5 list-decimal list-inside">
                          {opt.optimizedOrder.map(s => {
                            const isMoved = !opt.originalOrder.find(os => os.id === s.id);
                            return (
                              <li key={s.id} className={`truncate ${isMoved ? 'text-primary font-medium' : ''}`}>
                                {s.client_name}
                                {isMoved && <Badge className="ml-1 text-[10px] py-0 px-1 bg-primary">novo</Badge>}
                              </li>
                            );
                          })}
                        </ol>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {!hasChanges && (
              <div className="text-center py-8 text-muted-foreground">
                <Check className="h-8 w-8 mx-auto mb-2 text-green-500" />
                <p>As rotas já estão otimizadas! Não há melhorias a sugerir.</p>
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleApply} disabled={!hasChanges || applying}>
            {applying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
            Aplicar Otimização
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
