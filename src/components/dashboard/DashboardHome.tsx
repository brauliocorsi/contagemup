import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useProducts } from '@/hooks/useProducts';
import { useStockAlerts } from '@/hooks/useStockAlerts';
import { useWarehouseLocations } from '@/hooks/useWarehouseConfig';
import { useAuth } from '@/hooks/useAuth';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageContainer } from '@/components/layout/PageContainer';
import { buildDashboardNotices, type NoticeGroup } from '@/lib/dashboard/notices';
import { cn } from '@/lib/utils';
import { ArrowRight, ArrowUpRight, Bell, CheckCheck, Clock, Package, ScanBarcode, RefreshCw, TrendingUp, TrendingDown, Truck, AlertTriangle, MapPin, ClipboardList } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { pt } from 'date-fns/locale';

interface DashboardHomeProps { onNavigate: (tab: string) => void }

function Indicator({ label, value, detail, icon: Icon, onClick, tone = 'primary' }: {
  label: string; value: string; detail: string; icon: typeof Package; onClick: () => void; tone?: 'primary' | 'success' | 'warning' | 'info';
}) {
  const tones = { primary: 'text-primary bg-primary-soft', success: 'text-success bg-success-soft', warning: 'text-warning bg-warning-soft', info: 'text-info bg-info-soft' };
  return <Button variant="outline" onClick={onClick} className="group h-auto min-h-36 min-w-0 flex-col items-start justify-between gap-4 whitespace-normal rounded-lg border-border-subtle bg-card p-4 text-left hover:bg-surface-muted sm:p-5">
    <span className="flex w-full items-center justify-between gap-2"><span className={cn('flex h-8 w-8 items-center justify-center rounded-md', tones[tone])}><Icon className="h-4 w-4" /></span><ArrowUpRight className="text-muted-foreground group-hover:text-primary" /></span>
    <span className="flex w-full flex-col gap-1"><span className="font-heading text-3xl font-semibold tabular-nums leading-none">{value}</span><span className="text-sm font-medium">{label}</span><span className="text-xs font-normal text-muted-foreground">{detail}</span></span>
  </Button>;
}

export function DashboardHome({ onNavigate }: DashboardHomeProps) {
  const { products, loading: productsLoading } = useProducts();
  const { negativeStockCount, lowStockCount, outOfStockCount } = useStockAlerts();
  const { locations } = useWarehouseLocations();
  const { profile } = useAuth();
  const { canUseScanner } = useRoleAccess();
  const queryClient = useQueryClient();
  const [noticeGroup, setNoticeGroup] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const { data: locationUnits, isLoading: zonesLoading, isError: zonesError } = useQuery({
    queryKey: ['dashboard-location-units'],
    queryFn: async () => {
      const totals: Record<string, number> = {};
      const pageSize = 1000;
      for (let from = 0;; from += pageSize) {
        const { data, error } = await supabase.from('counts')
          .select('id, location, quantity')
          .gt('quantity', 0)
          .order('id')
          .range(from, from + pageSize - 1);
        if (error) throw error;
        for (const row of data ?? []) {
          const code = row.location?.trim().toUpperCase() ?? '';
          totals[code] = (totals[code] ?? 0) + row.quantity;
        }
        if (!data || data.length < pageSize) break;
      }
      return totals;
    },
    staleTime: 60000,
  });

  const zoneUnits = useMemo(() => {
    const sums = { quarantine: 0, conf: 0, dock: 0 };
    const types = new Map(locations.map(l => [l.code.trim().toUpperCase(), l.location_type]));
    for (const [code, quantity] of Object.entries(locationUnits ?? {})) {
      const type = types.get(code);
      if (type === 'quarantine' || code.includes('QUARENTENA')) sums.quarantine += quantity;
      else if (type === 'conferencia' || code === 'CONF') sums.conf += quantity;
      else if (type === 'pre_exit') sums.dock += quantity;
    }
    return sums;
  }, [locations, locationUnits]);

  // Indicador permanente: stock sem localização
  const { data: unlocated, isLoading: unlocatedLoading, isError: unlocatedError } = useQuery({
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
  const { data: action, isLoading: actionLoading, isError: actionError } = useQuery({
    queryKey: ['dashboard-action-zone'],
    queryFn: async () => {
      const [damages, staged, tasks] = await Promise.all([
        supabase.from('product_damages').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('delivery_notes').select('id', { count: 'exact', head: true }).in('status', ['staged', 'loaded']),
        supabase.from('scanner_picking_tasks').select('id', { count: 'exact', head: true }).in('status', ['pending', 'in_progress']),
      ]);
      for (const result of [damages, staged, tasks]) if (result.error) throw result.error;
      return {
        damages: damages.count ?? 0,
        staged: staged.count ?? 0,
        tasks: tasks.count ?? 0,
      };
    },
    staleTime: 60000,
  });

  const { data: recentMovements = [], isError: movementsError } = useQuery({
    queryKey: ['dashboard-recent-movements'],
    queryFn: async () => {
      const since = subDays(new Date(), 7).toISOString();
      const { data, error } = await supabase
        .from('stock_movements')
        .select('*, products(name, code)')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    },
    staleTime: 30000,
  });

  const { data: movementStats, isError: statsError } = useQuery({
    queryKey: ['dashboard-movement-stats'],
    queryFn: async () => {
      const weekAgo = subDays(new Date(), 7).toISOString();
      const [entries, exits] = await Promise.all([
        supabase.from('stock_movements').select('id', { count: 'exact', head: true }).eq('movement_type', 'entrada').gte('created_at', weekAgo),
        supabase.from('stock_movements').select('id', { count: 'exact', head: true }).eq('movement_type', 'saida').gte('created_at', weekAgo),
      ]);
      if (entries.error) throw entries.error;
      if (exits.error) throw exits.error;
      return { entries: entries.count ?? 0, exits: exits.count ?? 0 };
    },
    staleTime: 30000,
  });


  const productsReady = queryClient.getQueryState(['products'])?.status === 'success';
  const productsError = queryClient.getQueryState(['products'])?.status === 'error';
  const notices = buildDashboardNotices({
    negativeStock: productsReady ? negativeStockCount : undefined,
    replenishment: productsReady ? lowStockCount + outOfStockCount : undefined,
    unlocated: unlocated?.units,
    orphans: productsReady ? products.reduce((s, p) => s + (p.colis_orfaos ?? 0), 0) : undefined,
    damages: action?.damages,
    conf: locationUnits ? zoneUnits.conf : undefined,
    picking: action?.tasks,
    deliveries: action?.staged,
  });
  const visibleNotices = notices.filter(n => noticeGroup === 'all' || n.group === noticeGroup);
  const pending = productsLoading || zonesLoading || unlocatedLoading || actionLoading;
  const hasError = zonesError || unlocatedError || actionError || productsError || movementsError || statsError;
  const totalStock = products.reduce((s, p) => s + p.current_stock, 0);
  const physicalUnits = products.reduce((s, p) => s + (p.unidades_fisicas ?? p.current_stock * (p.total_colis || 1)), 0);
  const groupLabels: Record<NoticeGroup, string> = { stock: 'Stock', warehouse: 'Armazém', dispatch: 'Expedição' };
  const tones = { danger: 'bg-danger-soft text-danger', warning: 'bg-warning-soft text-warning', info: 'bg-info-soft text-info' };
  async function refresh() {
    setRefreshing(true);
    try {
      await Promise.all(['products', 'dashboard-location-units', 'dashboard-unlocated', 'dashboard-action-zone', 'dashboard-recent-movements', 'dashboard-movement-stats'].map(key => queryClient.invalidateQueries({ queryKey: [key] })));
    } finally { setRefreshing(false); }
  }

  return <PageContainer className="space-y-8">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">{format(new Date(), "EEEE, d 'de' MMMM", { locale: pt })}</p>
        <h1 className="font-heading text-3xl font-semibold">Visão geral</h1>
        <p className="mt-1 text-sm text-muted-foreground">{profile?.name ? `Olá, ${profile.name.split(' ')[0]}.` : 'Armazém UP Móveis'}</p>
      </div>
      <div className="flex max-w-full flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" aria-label="Atualizar indicadores" title="Atualizar indicadores" onClick={() => void refresh()} disabled={refreshing}><RefreshCw className={cn(refreshing && 'animate-spin')} /></Button>
        {canUseScanner && <Button asChild variant="outline"><Link to="/scanner"><ScanBarcode /> Scanner</Link></Button>}
        <Button onClick={() => onNavigate('separation-notes')}><ClipboardList /> Notas de Separação</Button>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Indicator label="Conjuntos em stock" value={productsReady ? totalStock.toLocaleString('pt-PT') : '—'} detail={productsReady ? `${products.length.toLocaleString('pt-PT')} produtos` : 'A carregar produtos'} icon={Package} onClick={() => onNavigate('products')} />
      <Indicator label="Pickings pendentes" value={action?.tasks.toLocaleString('pt-PT') ?? '—'} detail="Tarefas por concluir" icon={ClipboardList} tone="info" onClick={() => onNavigate('scanner-picking')} />
      <Indicator label="Notas por entregar" value={action?.staged.toLocaleString('pt-PT') ?? '—'} detail="No cais ou na viatura" icon={Truck} tone="warning" onClick={() => onNavigate('deliveries')} />
      <Indicator label="Entradas · 7 dias" value={movementStats?.entries.toLocaleString('pt-PT') ?? '—'} detail="Registos de entrada" icon={TrendingUp} tone="success" onClick={() => onNavigate('entries')} />
    </div>

    <section aria-labelledby="notices-heading">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2"><Bell className="h-5 w-5 text-primary" /><h2 id="notices-heading" className="font-heading text-xl font-semibold">Central de avisos</h2><Badge variant="secondary">{pending ? '…' : notices.length}</Badge></div>
        <span className="text-xs text-muted-foreground">Pendências do armazém</span>
      </div>
      <Tabs value={noticeGroup} onValueChange={setNoticeGroup}>
        <TabsList className="mb-4 h-auto max-w-full flex-wrap justify-start gap-1 bg-surface-muted p-1">
          <TabsTrigger value="all">Todos</TabsTrigger>
          {Object.entries(groupLabels).map(([key, label]) => <TabsTrigger key={key} value={key}>{label}<span className="ml-2 text-xs tabular-nums text-muted-foreground">{notices.filter(n => n.group === key).length}</span></TabsTrigger>)}
        </TabsList>
      </Tabs>
      {hasError && <div role="alert" className="mb-3 flex flex-wrap items-center gap-2 border-l-2 border-danger bg-danger-soft p-3 text-sm"><AlertTriangle className="h-4 w-4 text-danger" />Alguns indicadores não puderam ser carregados.<Button size="sm" variant="ghost" onClick={() => void refresh()}>Tentar novamente</Button></div>}
      {pending && notices.length === 0 ? <div className="space-y-2"><Skeleton className="h-20" /><Skeleton className="h-20" /></div> : visibleNotices.length === 0 ? <div className="flex items-center gap-3 border-y border-border-subtle py-8"><CheckCheck className="h-6 w-6 text-success" /><div><p className="text-sm font-semibold">{hasError || pending ? 'Aguardando indicadores' : 'Sem avisos nesta área'}</p><p className="mt-1 text-xs text-muted-foreground">{hasError || pending ? 'Os dados ainda não estão completos.' : 'Nenhuma pendência identificada.'}</p></div></div> :
        <div className="divide-y divide-border-subtle border-y border-border-subtle">
          {visibleNotices.map(notice => <Button key={notice.id} variant="ghost" onClick={() => onNavigate(notice.destination)} aria-label={`${notice.title}: ${notice.count}. ${notice.action}`} className="group h-auto min-h-24 w-full justify-start gap-3 whitespace-normal rounded-none px-2 py-4 text-left hover:bg-surface-muted sm:gap-4 sm:px-3">
            <span className={cn('flex h-11 w-14 shrink-0 items-center justify-center rounded-md text-xl font-semibold tabular-nums', tones[notice.tone])}>{notice.count.toLocaleString('pt-PT')}</span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{notice.title}</span><span className="mt-1 block text-xs font-normal text-muted-foreground">{notice.detail}</span></span>
            <span className="hidden shrink-0 text-xs text-primary sm:block">{notice.action}</span><ArrowRight className="shrink-0 text-muted-foreground group-hover:text-primary" />
          </Button>)}
        </div>}
    </section>

    <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
      <section aria-labelledby="warehouse-heading">
        <h2 id="warehouse-heading" className="mb-4 font-heading text-lg font-semibold">Armazém</h2>
        <div className="divide-y divide-border-subtle border-y border-border-subtle">
          {[
            { label: 'Colis físicos', value: productsReady ? physicalUnits : undefined, destination: 'products', icon: Package },
            { label: 'Em conferência · CONF', value: locationUnits ? zoneUnits.conf : undefined, destination: 'putaway', icon: MapPin },
            { label: 'No cais de carga', value: locationUnits ? zoneUnits.dock : undefined, destination: 'separation-notes', icon: Truck },
            { label: 'Em quarentena', value: locationUnits ? zoneUnits.quarantine : undefined, destination: 'damages', icon: AlertTriangle },
          ].map(item => <Button key={item.label} variant="ghost" onClick={() => onNavigate(item.destination)} className="h-14 w-full justify-start gap-3 rounded-none px-1"><item.icon className="text-muted-foreground" /><span className="min-w-0 flex-1 whitespace-normal text-left text-sm font-normal">{item.label}</span><span className="tabular-nums font-semibold">{item.value?.toLocaleString('pt-PT') ?? '—'}</span><ArrowUpRight className="text-muted-foreground" /></Button>)}
        </div>
        <Button variant="link" className="mt-2 h-auto px-0 text-xs" onClick={() => onNavigate('exits')}><TrendingDown />{movementStats?.exits ?? '—'} registos de saída nos últimos 7 dias<ArrowRight /></Button>
      </section>
      <section aria-labelledby="activity-heading">
        <div className="mb-4 flex items-center justify-between gap-2"><h2 id="activity-heading" className="font-heading text-lg font-semibold">Atividade recente</h2><Button variant="ghost" size="sm" onClick={() => onNavigate('movements')}>Histórico <ArrowUpRight /></Button></div>
        <div className="divide-y divide-border-subtle border-y border-border-subtle">
          {recentMovements.length === 0 ? <p className="py-8 text-sm text-muted-foreground">{movementsError ? 'Histórico indisponível' : 'Sem movimentos nos últimos 7 dias'}</p> : recentMovements.slice(0, 5).map(mov => <Button key={mov.id} variant="ghost" onClick={() => onNavigate('movements')} className="h-auto min-h-16 w-full justify-start gap-3 whitespace-normal rounded-none px-1 py-3 text-left">
            {mov.movement_type === 'entrada' ? <TrendingUp className="text-success" /> : <TrendingDown className="text-warning" />}
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{mov.products?.name || mov.products?.code || 'Produto'}</span><span className="mt-1 flex items-center gap-1 text-xs font-normal text-muted-foreground"><Clock className="h-3 w-3" />{format(new Date(mov.created_at), 'dd MMM · HH:mm', { locale: pt })}</span></span>
            <span className={cn('shrink-0 tabular-nums', mov.movement_type === 'entrada' ? 'text-success' : 'text-warning')}>{mov.movement_type === 'entrada' ? '+' : mov.movement_type === 'saida' ? '−' : ''}{mov.quantity}</span>
          </Button>)}
        </div>
      </section>
    </div>
  </PageContainer>;
}
