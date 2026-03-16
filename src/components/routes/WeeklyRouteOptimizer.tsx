import { useState, useMemo } from 'react';
import { useRoutes, RouteSchedule } from '@/hooks/useRoutes';
import { useRouteStops, RouteStop } from '@/hooks/useRoutes';
import { useDeliveryRegions } from '@/hooks/useDeliveryRegions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Calendar, MapPin, AlertTriangle, ChevronLeft, ChevronRight, Zap } from 'lucide-react';
import { format, startOfWeek, addDays, isSameDay } from 'date-fns';
import { WeeklyOptimizationDialog } from './WeeklyOptimizationDialog';
import { pt } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

interface WeeklyRouteOptimizerProps {
  onBack: () => void;
}

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function WeeklyRouteOptimizer({ onBack }: WeeklyRouteOptimizerProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [showOptimization, setShowOptimization] = useState(false);
  const { routes } = useRoutes();
  const { regions } = useDeliveryRegions();

  const weekStart = useMemo(() => {
    const base = startOfWeek(new Date(), { weekStartsOn: 1 });
    return addDays(base, weekOffset * 7);
  }, [weekOffset]);

  const weekDays = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
  [weekStart]);

  // Group routes by day of the week
  const routesByDay = useMemo(() => {
    const map = new Map<string, RouteSchedule[]>();
    weekDays.forEach(day => {
      const dayStr = format(day, 'yyyy-MM-dd');
      map.set(dayStr, routes.filter(r => r.scheduled_date === dayStr));
    });
    return map;
  }, [routes, weekDays]);

  // Fetch all stops for routes in this week
  const weekRouteIds = useMemo(() => {
    const ids: string[] = [];
    routesByDay.forEach(dayRoutes => dayRoutes.forEach(r => ids.push(r.id)));
    return ids;
  }, [routesByDay]);

  const { data: allStops = [] } = useQuery({
    queryKey: ['week-stops', weekRouteIds],
    queryFn: async () => {
      if (weekRouteIds.length === 0) return [];
      const { data, error } = await supabase
        .from('route_stops')
        .select('*')
        .in('route_id', weekRouteIds)
        .order('order_number');
      if (error) throw error;
      return data as RouteStop[];
    },
    enabled: weekRouteIds.length > 0,
  });

  const stopsByRoute = useMemo(() => {
    const map = new Map<string, RouteStop[]>();
    allStops.forEach(s => {
      if (!map.has(s.route_id)) map.set(s.route_id, []);
      map.get(s.route_id)!.push(s);
    });
    return map;
  }, [allStops]);

  // Calculate route distance
  const getRouteDistance = (routeId: string): number => {
    const stops = stopsByRoute.get(routeId) || [];
    const withCoords = stops.filter(s => s.latitude && s.longitude);
    let dist = 0;
    for (let i = 1; i < withCoords.length; i++) {
      dist += haversineDistance(withCoords[i-1].latitude!, withCoords[i-1].longitude!, withCoords[i].latitude!, withCoords[i].longitude!);
    }
    return dist;
  };

  const getRegionForRoute = (route: RouteSchedule) => {
    return regions.find(r => r.id === (route as any).region_id);
  };

  const totalWeekStops = allStops.length;
  const totalWeekDistance = weekRouteIds.reduce((sum, id) => sum + getRouteDistance(id), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <Calendar className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Otimizador Semanal</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setWeekOffset(w => w - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[200px] text-center">
            {format(weekDays[0], "dd MMM", { locale: pt })} – {format(weekDays[6], "dd MMM yyyy", { locale: pt })}
          </span>
          <Button variant="outline" size="icon" onClick={() => setWeekOffset(w => w + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setWeekOffset(0)}>Hoje</Button>
          <Button size="sm" onClick={() => setShowOptimization(true)} disabled={weekRouteIds.length === 0}>
            <Zap className="h-4 w-4 mr-1" />
            Otimizar Semana
          </Button>

      {/* Summary */}
      <div className="flex gap-3">
        <Badge variant="outline" className="text-sm py-1 px-3">
          {weekRouteIds.length} rotas
        </Badge>
        <Badge variant="outline" className="text-sm py-1 px-3">
          <MapPin className="h-3 w-3 mr-1" />{totalWeekStops} paragens
        </Badge>
        <Badge variant="outline" className="text-sm py-1 px-3">
          ~{totalWeekDistance.toFixed(0)} km total
        </Badge>
      </div>

      {/* Weekly grid */}
      <div className="grid grid-cols-7 gap-2">
        {weekDays.map((day, dayIdx) => {
          const dayStr = format(day, 'yyyy-MM-dd');
          const dayRoutes = routesByDay.get(dayStr) || [];
          const isToday = isSameDay(day, new Date());

          return (
            <Card key={dayIdx} className={`min-h-[200px] ${isToday ? 'ring-2 ring-primary' : ''}`}>
              <CardHeader className="p-2 pb-1">
                <CardTitle className="text-xs font-medium text-center">
                  <div className={`${isToday ? 'text-primary font-bold' : 'text-muted-foreground'}`}>
                    {WEEKDAYS[day.getDay()]}
                  </div>
                  <div className="text-lg">{format(day, 'dd')}</div>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2 pt-0 space-y-1.5">
                {dayRoutes.length === 0 && (
                  <p className="text-[10px] text-muted-foreground text-center py-4">Sem rotas</p>
                )}
                {dayRoutes.map(route => {
                  const region = getRegionForRoute(route);
                  const stops = stopsByRoute.get(route.id) || [];
                  const dist = getRouteDistance(route.id);

                  return (
                    <div
                      key={route.id}
                      className="rounded-md border p-1.5 text-xs space-y-0.5"
                      style={{ borderLeftWidth: 3, borderLeftColor: region?.color || 'hsl(var(--primary))' }}
                    >
                      <p className="font-medium truncate">{route.name}</p>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <MapPin className="h-2.5 w-2.5" />
                        <span>{stops.length} paragens</span>
                        {dist > 0 && <span>• {dist.toFixed(0)}km</span>}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
