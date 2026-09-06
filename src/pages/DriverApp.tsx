import { useEffect, useMemo, useState } from 'react';
import {
  Truck,
  Loader2,
  LogOut,
  MapPin,
  Navigation,
  PackageCheck,
  RefreshCw,
  ArrowLeft,
  AlertTriangle,
  Route as RouteIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { LoginForm } from '@/components/auth/LoginForm';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { DeliveryExecution } from '@/components/driver/DeliveryExecution';
import { useMyDeliveryAttempts, type DeliveryAttempt } from '@/hooks/useDeliveryAttempts';
import { useMyRoutes, useRoute, ROUTE_STATUS_LABELS } from '@/hooks/useRoutes';
import { clearAllDrafts, pruneRevokedDrafts } from '@/lib/delivery/draft';
import { RouteAccountingDialog } from '@/components/driver/RouteAccountingDialog';
import { useQuery } from '@tanstack/react-query';
import { fetchOrderDocuments } from '@/lib/logistics/api';
import { assemblyFromServices, type AssemblyInfo } from '@/lib/logistics/assembly';



function fmtDate(d: string | null) {
  if (!d) return 'Sem data';
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-PT');
}

/**
 * Área exclusiva do entregador. A atribuição é feita por rota:
 * quem entra vê as rotas que lhe foram atribuídas e, dentro de cada rota,
 * as entregas por ordem. O isolamento é garantido pelas regras do servidor.
 */
export default function DriverApp() {
  const { user, loading, signOut, profile } = useAuth();
  const { data: routes = [], isLoading: loadingRoutes, refetch: refetchRoutes } = useMyRoutes(user?.id);
  const {
    data: attempts = [],
    isLoading,
    refetch,
    isFetching,
  } = useMyDeliveryAttempts();
  const [routeId, setRouteId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [revoked, setRevoked] = useState(0);
  // Paragens da rota: dão a ordem planeada e as moradas para a simulação.
  const { data: routeData } = useRoute(routeId && routeId !== 'sem-rota' ? routeId : null);
  const stops = routeData?.stops ?? [];
  // Serviços de montagem da encomenda (vêm da Gestão Click, por número de encomenda).
  const vendaIds = stops.map((s) => s.venda_id).filter((v): v is string => Boolean(v));
  const { data: assemblyByCode = {} } = useQuery({
    queryKey: ['driver-assembly', routeId, vendaIds.join(',')],
    enabled: vendaIds.length > 0,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<Record<string, AssemblyInfo>> => {
      const { documents } = await fetchOrderDocuments(vendaIds);
      const map: Record<string, AssemblyInfo> = {};
      for (const d of documents) {
        const code = String(d.codigo ?? '').trim();
        if (code) map[code] = assemblyFromServices(d.servicos);
      }
      return map;
    },
  });



  // Rascunhos de entregas que já não estão acessíveis (rota reatribuída) são
  // descartados quando o aparelho volta a ter rede — e sinalizados ao entregador.
  useEffect(() => {
    if (!user?.id || isLoading || isFetching) return;
    const dropped = pruneRevokedDrafts(
      user.id,
      attempts.map((a) => a.id),
    );
    if (dropped.length > 0) setRevoked((n) => n + dropped.length);
  }, [user?.id, attempts, isLoading, isFetching]);

  const byRoute = useMemo(() => {
    const m = new Map<string, DeliveryAttempt[]>();
    for (const a of attempts) {
      const k = a.route_id ?? 'sem-rota';
      m.set(k, [...(m.get(k) ?? []), a]);
    }
    return m;
  }, [attempts]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!user) return <LoginForm />;

  const loose = byRoute.get('sem-rota') ?? [];
  const open: DeliveryAttempt | undefined = attempts.find((a) => a.id === openId);
  const currentRoute = routes.find((r) => r.id === routeId);
  // Ordem planeada da rota: cada encomenda segue o número de paragem definido no escritório.
  const stopOrder = new Map<string, number>();
  for (const s of stops) if (s.venda_codigo) stopOrder.set(s.venda_codigo, s.order_number);
  const routeAttempts = (routeId ? (byRoute.get(routeId) ?? []) : loose)
    .slice()
    .sort(
      (a, b) =>
        (stopOrder.get(a.order_number) ?? 9999) - (stopOrder.get(b.order_number) ?? 9999) ||
        a.order_number.localeCompare(b.order_number),
    );

  const simulateRoute = () => {
    const addresses = stops
      .slice()
      .sort((a, b) => a.order_number - b.order_number)
      .map((s) => s.address?.trim())
      .filter((a): a is string => Boolean(a));
    if (addresses.length === 0) {
      toast.error('Esta rota não tem moradas para simular');
      return;
    }
    const origin = routeData?.route.departure_address?.trim() || addresses[0];
    const destination = addresses[addresses.length - 1];
    const waypoints = addresses.slice(0, -1).filter((a) => a !== origin);
    const params = new URLSearchParams({ api: '1', travelmode: 'driving', origin, destination });
    if (waypoints.length > 0) params.set('waypoints', waypoints.join('|'));
    window.open(`https://maps.google.com/maps/dir/?${params.toString()}`, '_blank', 'noopener');
  };


  const refreshAll = () => {
    void refetch();
    void refetchRoutes();
  };

  const handleSignOut = async () => {
    if (user?.id) clearAllDrafts(user.id);
    await signOut();
  };

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <Truck className="h-5 w-5 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {routeId || openId ? currentRoute?.name ?? 'Entregas' : 'Minhas rotas'}
            </p>
            <p className="truncate text-xs text-muted-foreground">{profile?.name ?? user.email}</p>
          </div>
          <Button variant="ghost" size="icon" aria-label="Atualizar" onClick={refreshAll}>
            <RefreshCw className={isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Sair" onClick={() => void handleSignOut()}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4">
        {revoked > 0 && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-warning/50 bg-warning/10 p-3 text-xs">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <span>
              {revoked} entrega(s) deixaram de estar atribuídas a si e o trabalho por enviar não pôde
              ser gravado. Fale com o responsável antes de repetir a entrega.
            </span>
          </div>
        )}

        {open ? (
          <DeliveryExecution
            attempt={open}
            assembly={assemblyByCode[open.order_number.trim()] ?? null}
            onBack={() => setOpenId(null)}
          />
        ) : isLoading || loadingRoutes ? (

          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : routeId !== null || (routes.length === 0 && loose.length > 0) ? (
          <div className="space-y-2">
            {routeId && (
              <Button variant="ghost" size="sm" className="mb-1" onClick={() => setRouteId(null)}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Minhas rotas
              </Button>
            )}
            {routeId && routeId !== 'sem-rota' && (
              <Button variant="outline" className="w-full" onClick={simulateRoute}>
                <Navigation className="mr-2 h-4 w-4" /> Simular rota no Google Maps
              </Button>
            )}
            {routeId && currentRoute && (
              <RouteAccountingDialog
                routeId={routeId}
                routeName={currentRoute.name}
                attempts={routeAttempts}
              />
            )}
            {routeAttempts.length === 0 ? (
              <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                <PackageCheck className="mx-auto mb-2 h-6 w-6" />
                Sem entregas pendentes nesta rota.
              </div>
            ) : (
              routeAttempts.map((a) => (
                <Card key={a.id}>
                  <CardContent className="p-0">
                    <button className="w-full space-y-1 p-4 text-left" onClick={() => setOpenId(a.id)}>
                      <div className="flex items-center gap-2">
                        {stopOrder.has(a.order_number) && (
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                            {stopOrder.get(a.order_number)}
                          </span>
                        )}
                        <span className="min-w-0 flex-1 truncate font-semibold">
                          {a.client_name || 'Cliente'}
                        </span>
                        <Badge variant={a.status === 'in_transit' ? 'default' : 'secondary'}>
                          {a.status === 'in_transit' ? 'A caminho' : 'Por iniciar'}
                        </Badge>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        Encomenda {a.order_number} • {fmtDate(a.scheduled_date)}
                        {a.attempt_number > 1 ? ` • tentativa ${a.attempt_number}` : ''}
                      </p>
                      {a.address && (
                        <p className="flex items-start gap-1 text-xs text-muted-foreground">
                          <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                          <span className="truncate">{a.address}</span>
                        </p>
                      )}
                      <div className="flex flex-wrap gap-1">
                        {assemblyByCode[a.order_number.trim()]?.hasAssembly ? (
                          <Badge variant="default">Com montagem</Badge>
                        ) : assemblyByCode[a.order_number.trim()] ? (
                          <Badge variant="outline">Sem montagem</Badge>
                        ) : null}
                        {a.partial_load && (
                          <Badge variant="outline" className="border-warning/50 text-warning">
                            Carga incompleta do armazém
                          </Badge>
                        )}
                      </div>

                    </button>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        ) : routes.length === 0 && loose.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            <PackageCheck className="mx-auto mb-2 h-6 w-6" />
            Não tem rotas atribuídas de momento.
          </div>
        ) : (
          <div className="space-y-2">
            {routes.map((r) => {
              const list = byRoute.get(r.id) ?? [];
              const started = list.filter((a) => a.status === 'in_transit').length;
              return (
                <Card key={r.id}>
                  <CardContent className="p-0">
                    <button
                      className="w-full space-y-1 p-4 text-left"
                      onClick={() => setRouteId(r.id)}
                    >
                      <div className="flex items-center gap-2">
                        <RouteIcon className="h-4 w-4 shrink-0 text-primary" />
                        <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
                        <Badge variant={r.status === 'in_progress' ? 'default' : 'secondary'}>
                          {ROUTE_STATUS_LABELS[r.status]}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {fmtDate(r.scheduled_date)} • {list.length} entrega(s) por fazer
                        {started > 0 ? ` • ${started} a caminho` : ''}
                      </p>
                    </button>
                  </CardContent>
                </Card>
              );
            })}
            {loose.length > 0 && (
              <Card>
                <CardContent className="p-0">
                  <button className="w-full p-4 text-left" onClick={() => setRouteId('sem-rota')}>
                    <span className="font-semibold">Entregas avulso</span>
                    <p className="text-xs text-muted-foreground">
                      {loose.length} entrega(s) fora de rota atribuídas a si
                    </p>
                  </button>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
