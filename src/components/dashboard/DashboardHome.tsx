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
  ArrowRight, Clock, AlertOctagon, BarChart3, LayoutDashboard, PackageSearch
} from 'lucide-react';
import { format, subDays, startOfDay } from 'date-fns';
import { pt } from 'date-fns/locale';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatCard } from '@/components/layout/StatCard';

function ActionTile({ label, value, hint, onClick }: { label: string; value: number; hint: string; onClick: () => void }) {
  const active = value > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'text-left rounded-lg border p-3 transition-colors ' +
        (active
          ? 'border-warning/40 bg-warning-soft/50 hover:bg-warning-soft'
          : 'border-border-subtle bg-surface-muted/40 hover:bg-surface-muted')
      }
    >
      <p className="text-2xl font-bold tabular-nums">{value.toLocaleString('pt-PT')}</p>
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </button>
  );
}

interface DashboardHomeProps {
  onNavigate: (tab: string) => void;
}

export function DashboardHome({ onNavigate }: DashboardHomeProps) {
  const { products } = useProducts();
  const { alerts, outOfStockCount, lowStockCount, totalAlerts } = useStockAlerts();

  // Indicador permanente: stock sem localização
  const { data: unlocated } = useQuery({
    queryKey: ['dashboard-unlocated'],
    queryFn: async () => {
      const rows: { product_id: string; quantity: number }[] = [];
      let from = 0;
      const step = 1000;
      for (;;) {
        const { data, error } = await supabase
          .from('counts')
          .select('product_id, quantity')
          .or('location.is.null,location.eq.,location.eq.SEM-LOCALIZACAO')
          .gt('quantity', 0)
          .order('product_id', { ascending: true })
          .range(from, from + step - 1);
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < step) break;
        from += step;
      }
      return {
        units: rows.reduce((s, r) => s + (r.quantity || 0), 0),
        products: new Set(rows.map(r => r.product_id)).size,
      };
    },
    staleTime: 60000,
  });

  // Zona "Precisa de Ação": o que está parado à espera de alguém
  const { data: action } = useQuery({
    queryKey: ['dashboard-action-zone'],
    queryFn: async () => {
      const [damages, staged, tasks, orphans, quarantine] = await Promise.all([
        supabase.from('product_damages').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('delivery_notes').select('id', { count: 'exact', head: true }).in('status', ['staged', 'loaded']),
        supabase.from('scanner_picking_tasks').select('id', { count: 'exact', head: true }).in('status', ['pending', 'in_progress']),
        supabase.from('products').select('colis_orfaos').gt('colis_orfaos', 0),
        supabase.from('counts').select('quantity').ilike('location', '%QUARENTENA%').gt('quantity', 0),
      ]);
      return {
        damages: damages.count ?? 0,
        staged: staged.count ?? 0,
        tasks: tasks.count ?? 0,
        orphanProducts: (orphans.data || []).length,
        orphanUnits: (orphans.data || []).reduce((s: number, r: any) => s + (r.colis_orfaos || 0), 0),
        quarantineUnits: (quarantine.data || []).reduce((s: number, r: any) => s + (r.quantity || 0), 0),
      };
    },
    staleTime: 60000,
  });

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

  const { data: movementStats } = useQuery({
    queryKey: ['dashboard-movement-stats'],
    queryFn: async () => {
      const today = startOfDay(new Date()).toISOString();
      const weekAgo = subDays(new Date(), 7).toISOString();

      const [todayRes, weekRes] = await Promise.all([
        supabase.from('stock_movements').select('movement_type, quantity').gte('created_at', today),
        supabase.from('stock_movements').select('movement_type, quantity').gte('created_at', weekAgo),
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

      return { today: calcStats(todayRes.data), week: calcStats(weekRes.data) };
    },
    staleTime: 30000,
  });

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
  const physicalUnits = useMemo(
    () => products.reduce((s, p: any) => s + (p.unidades_fisicas ?? p.current_stock * (p.total_colis || 1)), 0),
    [products],
  );

  const todayStats = movementStats?.today;
  const weekStats = movementStats?.week;

  return (
    <PageContainer>
      <PageHeader
        icon={<LayoutDashboard className="h-5 w-5" />}
        title="Dashboard"
        description="Visão geral do inventário"
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Unidades em stock"
          value={totalStock.toLocaleString('pt-PT')}
          hint={`${totalProducts} produtos`}
          icon={<Package className="h-5 w-5" />}
          tone="primary"
          onClick={() => onNavigate('products')}
        />
        <StatCard
          label="Entradas (7 dias)"
          value={weekStats?.entriesQty ?? 0}
          badge={`${todayStats?.entriesCount ?? 0} hoje`}
          icon={<TrendingUp className="h-5 w-5" />}
          tone="success"
          onClick={() => onNavigate('entries')}
        />
        <StatCard
          label="Saídas (7 dias)"
          value={weekStats?.exitsQty ?? 0}
          badge={`${todayStats?.exitsCount ?? 0} hoje`}
          icon={<TrendingDown className="h-5 w-5" />}
          tone="warning"
          onClick={() => onNavigate('exits')}
        />
        <StatCard
          label="Alertas de stock"
          value={outOfStockCount}
          hint={`${lowStockCount} com stock baixo`}
          badge={totalAlerts > 0 ? totalAlerts : undefined}
          icon={<AlertTriangle className="h-5 w-5" />}
          tone="danger"
          onClick={() => onNavigate('alerts')}
        />
      </div>

      {(unlocated?.units ?? 0) > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex flex-col sm:flex-row sm:items-center gap-3 py-4">
            <PackageSearch className="h-5 w-5 text-destructive" />
            <div className="flex-1">
              <p className="text-sm font-medium text-destructive">
                {unlocated?.units} unidades sem localização em {unlocated?.products} produtos
              </p>
              <p className="text-xs text-muted-foreground">
                Este stock não pode ser separado até ter uma morada no armazém.
              </p>
            </div>
            <Button size="sm" variant="destructive" onClick={() => onNavigate('putaway')}>
              Arrumar agora
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Precisa de Ação */}
      <Card className="border-border-subtle">
        <CardHeader className="pb-3">
          <CardTitle className="font-heading text-base flex items-center gap-2">
            <AlertOctagon className="h-4 w-4 text-muted-foreground" />
            Precisa de ação
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <ActionTile
            label="Sem localização"
            value={unlocated?.units ?? 0}
            hint="unidades por arrumar"
            onClick={() => onNavigate('putaway')}
          />
          <ActionTile
            label="Colis órfãos"
            value={action?.orphanUnits ?? 0}
            hint={`${action?.orphanProducts ?? 0} produtos incompletos`}
            onClick={() => onNavigate('orphan-colis')}
          />
          <ActionTile
            label="Avarias por resolver"
            value={action?.damages ?? 0}
            hint="em quarentena"
            onClick={() => onNavigate('damages')}
          />
          <ActionTile
            label="Pickings a decorrer"
            value={action?.tasks ?? 0}
            hint={`${action?.staged ?? 0} notas no cais/carrinha`}
            onClick={() => onNavigate('scanner-picking')}
          />
        </CardContent>
      </Card>

      {/* Estado do armazém */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Conjuntos completos"
          value={totalStock.toLocaleString('pt-PT')}
          hint="prontos a vender"
          icon={<Package className="h-5 w-5" />}
          tone="success"
        />
        <StatCard
          label="Unidades físicas"
          value={physicalUnits.toLocaleString('pt-PT')}
          hint="tudo o que existe no armazém"
          icon={<PackageSearch className="h-5 w-5" />}
        />
        <StatCard
          label="Colis órfãos"
          value={(action?.orphanUnits ?? 0).toLocaleString('pt-PT')}
          hint="partes sem conjunto"
          icon={<AlertTriangle className="h-5 w-5" />}
          tone="warning"
          onClick={() => onNavigate('orphan-colis')}
        />
        <StatCard
          label="Em quarentena"
          value={(action?.quarantineUnits ?? 0).toLocaleString('pt-PT')}
          hint="fora do stock disponível"
          icon={<AlertOctagon className="h-5 w-5" />}
          tone="danger"
          onClick={() => onNavigate('damages')}
        />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-border-subtle">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="font-heading text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Últimos Movimentos
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => onNavigate('entries')} className="text-xs h-7">
                Ver todos <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            {recentMovements.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Sem movimentos recentes</p>
            ) : (
              recentMovements.slice(0, 8).map((mov: any) => (
                <div key={mov.id} className="flex items-center justify-between py-2 border-b border-border-subtle last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    {mov.movement_type === 'entrada' ? (
                      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-success-soft text-success shrink-0">
                        <TrendingUp className="h-3.5 w-3.5" />
                      </div>
                    ) : (
                      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-warning-soft text-warning shrink-0">
                        <TrendingDown className="h-3.5 w-3.5" />
                      </div>
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
                  <span
                    className={
                      'text-sm font-semibold tabular-nums ' +
                      (mov.movement_type === 'entrada' ? 'text-success' : 'text-warning')
                    }
                  >
                    {mov.movement_type === 'entrada' ? '+' : '−'}{mov.quantity}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-border-subtle">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="font-heading text-base flex items-center gap-2">
                <AlertOctagon className="h-4 w-4 text-muted-foreground" />
                Alertas de Stock
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => onNavigate('alerts')} className="text-xs h-7">
                Ver todos <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            {alerts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Sem alertas activos ✓</p>
            ) : (
              alerts.slice(0, 8).map((alert) => (
                <div key={alert.product.id} className="flex items-center justify-between py-2 border-b border-border-subtle last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{alert.product.name}</p>
                    <p className="text-xs text-muted-foreground">{alert.product.code}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {alert.product.current_stock}/{alert.product.min_stock}
                    </span>
                    <Badge
                      variant="outline"
                      className={
                        alert.type === 'out_of_stock' || alert.type === 'negative_stock'
                          ? 'bg-danger-soft text-danger border-danger/20'
                          : 'bg-warning-soft text-warning border-warning/20'
                      }
                    >
                      {alert.type === 'negative_stock' ? 'Negativo' : alert.type === 'out_of_stock' ? 'Esgotado' : 'Baixo'}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {recentPicking.length > 0 && (
        <Card className="border-border-subtle">
          <CardHeader className="pb-3">
            <CardTitle className="font-heading text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              Últimas Sessões de Picking
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {recentPicking.slice(0, 6).map((session: any) => {
                const totalQty = (session.picking_items || []).reduce((s: number, i: any) => s + i.quantity, 0);
                return (
                  <div key={session.id} className="p-3 rounded-lg border border-border-subtle bg-surface-muted/40 hover:bg-surface-muted transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(session.created_at), "dd/MM HH:mm", { locale: pt })}
                      </span>
                      <Badge variant="outline" className="text-xs bg-primary/5 text-primary border-primary/20 tabular-nums">
                        {totalQty} un.
                      </Badge>
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
    </PageContainer>
  );
}
