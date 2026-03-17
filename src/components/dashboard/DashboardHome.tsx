import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useProducts } from '@/hooks/useProducts';
import { useStockAlerts } from '@/hooks/useStockAlerts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  TrendingUp, TrendingDown, AlertTriangle, Package,
  ArrowRight, Clock, AlertOctagon, BarChart3
} from 'lucide-react';
import { format, subDays, startOfDay } from 'date-fns';
import { pt } from 'date-fns/locale';

interface DashboardHomeProps {
  onNavigate: (tab: string) => void;
}

export function DashboardHome({ onNavigate }: DashboardHomeProps) {
  const { products, loading: productsLoading } = useProducts();
  const { alerts, outOfStockCount, lowStockCount, totalAlerts } = useStockAlerts();

  // Recent stock movements (last 7 days)
  const { data: recentMovements = [] } = useQuery({
    queryKey: ['dashboard-recent-movements'],
    queryFn: async () => {
      const since = subDays(new Date(), 7).toISOString();
      const { data } = await supabase
        .from('stock_movements')
        .select('*, products(name, code)')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(10);
      return data || [];
    },
    staleTime: 30000,
  });

  // Movement stats (today and last 7 days)
  const { data: movementStats } = useQuery({
    queryKey: ['dashboard-movement-stats'],
    queryFn: async () => {
      const today = startOfDay(new Date()).toISOString();
      const weekAgo = subDays(new Date(), 7).toISOString();

      const [todayRes, weekRes] = await Promise.all([
        supabase
          .from('stock_movements')
          .select('movement_type, quantity')
          .gte('created_at', today),
        supabase
          .from('stock_movements')
          .select('movement_type, quantity')
          .gte('created_at', weekAgo),
      ]);

      const calcStats = (data: any[] | null) => {
        const entries = (data || []).filter(m => m.movement_type === 'entrada');
        const exits = (data || []).filter(m => m.movement_type === 'saida');
        return {
          entriesCount: entries.length,
          entriesQty: entries.reduce((s, m) => s + m.quantity, 0),
          exitsCount: exits.length,
          exitsQty: exits.reduce((s, m) => s + m.quantity, 0),
        };
      };

      return {
        today: calcStats(todayRes.data),
        week: calcStats(weekRes.data),
      };
    },
    staleTime: 30000,
  });

  // Recent picking sessions
  const { data: recentPicking = [] } = useQuery({
    queryKey: ['dashboard-recent-picking'],
    queryFn: async () => {
      const { data } = await supabase
        .from('picking_sessions')
        .select('*, picking_items(quantity)')
        .order('created_at', { ascending: false })
        .limit(5);
      return data || [];
    },
    staleTime: 30000,
  });

  const totalProducts = products.length;
  const totalStock = useMemo(() => products.reduce((s, p) => s + p.current_stock, 0), [products]);

  const todayStats = movementStats?.today;
  const weekStats = movementStats?.week;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visão geral do inventário</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => onNavigate('products')}>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center justify-between mb-2">
              <Package className="h-5 w-5 text-primary" />
              <Badge variant="secondary" className="text-xs">{totalProducts}</Badge>
            </div>
            <p className="text-2xl font-bold text-foreground">{totalStock}</p>
            <p className="text-xs text-muted-foreground">Unidades em stock</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => onNavigate('entries')}>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center justify-between mb-2">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
              <Badge className="bg-emerald-100 text-emerald-700 text-xs">{todayStats?.entriesCount || 0} hoje</Badge>
            </div>
            <p className="text-2xl font-bold text-foreground">{weekStats?.entriesQty || 0}</p>
            <p className="text-xs text-muted-foreground">Entradas (7 dias)</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => onNavigate('exits')}>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center justify-between mb-2">
              <TrendingDown className="h-5 w-5 text-orange-600" />
              <Badge className="bg-orange-100 text-orange-700 text-xs">{todayStats?.exitsCount || 0} hoje</Badge>
            </div>
            <p className="text-2xl font-bold text-foreground">{weekStats?.exitsQty || 0}</p>
            <p className="text-xs text-muted-foreground">Saídas (7 dias)</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => onNavigate('alerts')}>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center justify-between mb-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <Badge variant="destructive" className="text-xs">{totalAlerts}</Badge>
            </div>
            <div className="flex gap-2 items-baseline">
              <p className="text-2xl font-bold text-foreground">{outOfStockCount}</p>
              <span className="text-xs text-muted-foreground">esgotados</span>
            </div>
            <p className="text-xs text-muted-foreground">{lowStockCount} com stock baixo</p>
          </CardContent>
        </Card>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent movements */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Últimos Movimentos
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => onNavigate('entries')} className="text-xs">
                Ver todos <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentMovements.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Sem movimentos recentes</p>
            ) : (
              recentMovements.slice(0, 8).map((mov: any) => (
                <div key={mov.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    {mov.movement_type === 'entrada' ? (
                      <TrendingUp className="h-4 w-4 text-emerald-600 shrink-0" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-orange-600 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {mov.products?.name || mov.products?.code || '—'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(mov.created_at), "dd MMM HH:mm", { locale: pt })}
                        {mov.reason && ` · ${mov.reason}`}
                      </p>
                    </div>
                  </div>
                  <Badge
                    className={mov.movement_type === 'entrada'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-orange-100 text-orange-700'
                    }
                  >
                    {mov.movement_type === 'entrada' ? '+' : '-'}{mov.quantity}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Stock Alerts */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertOctagon className="h-4 w-4" />
                Alertas de Stock
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => onNavigate('alerts')} className="text-xs">
                Ver todos <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {alerts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Sem alertas activos ✓</p>
            ) : (
              alerts.slice(0, 8).map((alert) => (
                <div key={alert.product.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{alert.product.name}</p>
                    <p className="text-xs text-muted-foreground">{alert.product.code}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono">
                      {alert.product.current_stock}/{alert.product.min_stock}
                    </span>
                    <Badge variant={alert.type === 'out_of_stock' ? 'destructive' : 'outline'} className="text-xs">
                      {alert.type === 'out_of_stock' ? 'Esgotado' : 'Baixo'}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Picking */}
      {recentPicking.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Últimas Sessões de Picking
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {recentPicking.slice(0, 6).map((session: any) => {
                const totalQty = (session.picking_items || []).reduce((s: number, i: any) => s + i.quantity, 0);
                return (
                  <div key={session.id} className="p-3 rounded-lg border border-border bg-card">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(session.created_at), "dd/MM HH:mm", { locale: pt })}
                      </span>
                      <Badge variant="secondary" className="text-xs">{totalQty} un.</Badge>
                    </div>
                    {session.reference && (
                      <p className="text-sm font-medium truncate">{session.reference}</p>
                    )}
                    {session.reason && (
                      <p className="text-xs text-muted-foreground truncate">{session.reason}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
