import { useVehicles, vehiclePlate } from '@/hooks/useVehicles';
import {
  useRoutePicking,
  useSaveRoutePicking,
  PICKING_PROGRESS_LABELS,
  type SavePickingLine,
} from '@/hooks/useRoutePicking';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  FileSpreadsheet,
  ListChecks,
  MapPin,
  Printer,
  ScanBarcode,
  Trash2,
  Truck,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import { OrderDocument } from './OrderDocument';
import { GuidesDocument } from './GuidesDocument';
import { PickingReport } from './PickingReport';
import { AddRouteStops } from './AddRouteStops';
import { RouteDriverCard } from './RouteDriverCard';
import { RoutePreparationCard } from './RoutePreparationCard';
import { useRoutePayables } from '@/hooks/useDeliveryFinance';
import { formatCents } from '@/lib/finance/money';
import { buildPicking, exportPickingXlsx, groupByCategory, type PickingLine } from '@/lib/logistics/picking';
import { attachPickingLocations } from '@/lib/logistics/pickingLocations';
import { useCreatePickingTask } from '@/hooks/useScannerPickingTasks';
import {
  buildDeliveryRoute,
  createTransportGuides,
  fetchGuideHistory,
  fetchOrderDocuments,
} from '@/lib/logistics/api';
import {
  DEFAULT_ADDRESS_FROM,
  type GcDocument,
  type GuideRecord,
  type GuideResult,
  type SepOrder,
} from '@/lib/logistics/types';
import {
  plateFromNotes,
  ROUTE_STATUS_LABELS,
  useRemoveRouteStop,
  useReorderRouteStops,
  useRoute,
  useUpdateRoute,
  type RouteStatus,
} from '@/hooks/useRoutes';

function docsToOrders(docs: GcDocument[]): SepOrder[] {
  return docs.map(
    (d) =>
      ({
        id: d.id,
        codigo: d.codigo,
        cliente: d.cliente?.nome ?? '',
        produtos: d.produtos.map((p) => ({
          codigo: p.codigo,
          nome: p.nome,
          detalhes: p.detalhes,
          quantidade: p.quantidade,
        })),
      }) as unknown as SepOrder,
  );
}

export function RouteDetailView({ routeId, onBack }: { routeId: string; onBack: () => void }) {
  const { data, isLoading } = useRoute(routeId);
  const route = data?.route;
  const stops = useMemo(() => data?.stops ?? [], [data]);

  // Previsto da Gestão Click por encomenda: já pago vs. por receber na entrega.
  const { data: payables = [] } = useRoutePayables(routeId);
  const previstoByCode = useMemo(() => {
    const map: Record<string, { paid: number; due: number; review: number }> = {};
    for (const p of payables) {
      const code = String(p.gc_sale_code ?? '').trim();
      if (!code) continue;
      const entry = (map[code] ??= { paid: 0, due: 0, review: 0 });
      if (p.classification === 'already_paid') entry.paid += p.amount_cents;
      else if (p.classification === 'collect_on_delivery') entry.due += p.amount_cents;
      else entry.review += p.amount_cents;
    }
    return map;
  }, [payables]);



  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [copies, setCopies] = useState<Record<string, number>>({});
  const [printMode, setPrintMode] = useState<'docs' | 'picking' | 'guides'>('docs');
  const [printDocs, setPrintDocs] = useState<GcDocument[]>([]);
  const [picking, setPicking] = useState<PickingLine[] | null>(null);
  const [excluded, setExcluded] = useState<Record<string, boolean>>({});
  const [byCategory, setByCategory] = useState(false);
  const [guides, setGuides] = useState<GuideResult[]>([]);
  const [history, setHistory] = useState<Record<string, GuideRecord>>({});
  const [confirmReissue, setConfirmReissue] = useState(false);
  const [routeLinks, setRouteLinks] = useState<string[]>([]);
  const [addressFrom, setAddressFrom] = useState(DEFAULT_ADDRESS_FROM);
  const { data: vehicles = [] } = useVehicles();
  const [vehicleId, setVehicleId] = useState<string>('');
  const [plate, setPlate] = useState<string>('');
  const [loadDate, setLoadDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [loadTime, setLoadTime] = useState('08:00');

  const createTask = useCreatePickingTask();
  const savePicking = useSaveRoutePicking();
  const { data: savedPicking } = useRoutePicking(routeId ?? null);
  const updateRoute = useUpdateRoute();
  const removeStop = useRemoveRouteStop();
  const reorder = useReorderRouteStops();

  useEffect(() => {
    if (!route) return;
    setAddressFrom(route.departure_address || DEFAULT_ADDRESS_FROM);
    const fromVehicle = vehicles.find((v) => v.id === route.vehicle_location_id);
    const p = fromVehicle ? vehiclePlate(fromVehicle) : plateFromNotes(route.notes);
    if (p) setPlate(p);
    setVehicleId(route.vehicle_location_id ?? fromVehicle?.id ?? '');
    if (route.scheduled_date) setLoadDate(route.scheduled_date);
  }, [route, vehicles]);

  useEffect(() => {
    setSelected((prev) =>
      Object.fromEntries(stops.map((s) => [s.id, prev[s.id] ?? true])),
    );
  }, [stops]);

  const vendaIds = useMemo(
    () => stops.map((s) => s.venda_id).filter((v): v is string => Boolean(v)),
    [stops],
  );

  const docsQuery = useQuery({
    queryKey: ['route-documents', routeId, vendaIds.join(',')],
    enabled: vendaIds.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => (await fetchOrderDocuments(vendaIds)).documents,
  });

  useEffect(() => {
    if (vendaIds.length === 0) return;
    fetchGuideHistory(vendaIds)
      .then((res) => {
        const map: Record<string, GuideRecord> = {};
        for (const g of res.history) {
          const current = map[g.order_id];
          if (!current || g.version > current.version) map[g.order_id] = g;
        }
        setHistory(map);
      })
      .catch(() => undefined);
  }, [vendaIds]);

  const chosenStops = useMemo(() => stops.filter((s) => selected[s.id]), [stops, selected]);
  const chosenIds = useMemo(
    () => chosenStops.map((s) => s.venda_id).filter((v): v is string => Boolean(v)),
    [chosenStops],
  );
  const chosenDocs = useMemo(
    () => (docsQuery.data ?? []).filter((d) => chosenIds.includes(d.id)),
    [docsQuery.data, chosenIds],
  );
  const totalPages = useMemo(
    () => chosenStops.reduce((sum, s) => sum + Math.max(1, copies[s.id] ?? 1), 0),
    [chosenStops, copies],
  );
  const totalItems = useMemo(
    () => chosenDocs.reduce((sum, d) => sum + d.produtos.length, 0),
    [chosenDocs],
  );

  function runPrint() {
    const style = document.createElement('style');
    style.id = 'a4-page-rule';
    style.textContent = '@page { size: A4 portrait; margin: 10mm; }';
    document.head.appendChild(style);
    window.setTimeout(() => {
      window.print();
      window.setTimeout(() => style.remove(), 1000);
    }, 150);
  }

  function printDocuments() {
    if (chosenDocs.length === 0) {
      toast.error('Selecione pelo menos uma nota');
      return;
    }
    const pages = chosenStops.flatMap((s) => {
      const doc = chosenDocs.find((d) => d.id === s.venda_id);
      if (!doc) return [];
      return Array.from({ length: Math.max(1, copies[s.id] ?? 1) }, () => doc);
    });
    setPrintMode('docs');
    setPrintDocs(pages);
    runPrint();
  }

  const pickingKept = useMemo(
    () => (picking ?? []).filter((l) => !excluded[l.key]),
    [picking, excluded],
  );

  type PickingRow =
    | { type: 'cat'; categoria: string; quantidade: number; lines: PickingLine[] }
    | { type: 'line'; line: PickingLine };

  const pickingRows = useMemo<PickingRow[]>(() => {
    const lines = picking ?? [];
    if (!byCategory) return lines.map((line) => ({ type: 'line', line }));
    return groupByCategory(lines).flatMap((g) => [
      {
        type: 'cat' as const,
        categoria: g.categoria,
        quantidade: g.lines.reduce((s, l) => (excluded[l.key] ? s : s + l.quantidade), 0),
        lines: g.lines,
      },
      ...g.lines.map((line) => ({ type: 'line' as const, line })),
    ]);
  }, [picking, byCategory, excluded]);

  async function generatePicking() {
    if (chosenDocs.length === 0) {
      toast.error('Selecione pelo menos uma nota');
      return;
    }
    const lines = buildPicking(docsToOrders(chosenDocs));
    setPicking(lines);
    setExcluded({});
    toast.success(`${lines.length} artigo(s) no picking`);
    try {
      setPicking(await attachPickingLocations(lines));
    } catch {
      toast.error('Não foi possível carregar as localizações');
    }
  }

  function printPickingReport() {
    if (pickingKept.length === 0) {
      toast.error('Nenhum artigo no picking');
      return;
    }
    setPrintDocs([]);
    setPrintMode('picking');
    runPrint();
  }

  async function exportPicking() {
    if (pickingKept.length === 0) {
      toast.error('Nenhum artigo no picking');
      return;
    }
    const day = route?.scheduled_date ?? new Date().toISOString().slice(0, 10);
    await exportPickingXlsx(pickingKept, day, day, byCategory);
    toast.success('Ficheiro Excel gerado');
  }

  async function sendToScanner() {
    const all = picking ?? [];
    if (all.length === 0) {
      toast.error('Gere primeiro o picking');
      return;
    }
    if (pickingKept.length === 0) {
      toast.error('Nenhum artigo no picking');
      return;
    }
    const lines: SavePickingLine[] = all.flatMap((l) => {
      const base = {
        key: l.key,
        product_code: l.codigo,
        product_name: l.nome,
        details: l.detalhes || null,
        locations: l.localizacoes ?? null,
        excluded: Boolean(excluded[l.key]),
      };
      const entries = Object.entries(l.porEncomenda ?? {}).filter(([, q]) => q > 0);
      if (entries.length === 0) {
        return [
          { ...base, orders: l.encomendas.join(', ') || null, requested_quantity: l.quantidade },
        ];
      }
      return entries.map(([order, qty]) => ({ ...base, orders: order, requested_quantity: qty }));
    });

    await savePicking.mutateAsync({
      routeId: routeId ?? null,
      name: `Picking ${route?.name ?? 'rota'}`,
      reference: `ROTA-${route?.scheduled_date ?? ''}`,
      notes: `${chosenStops.length} nota(s) da rota ${route?.name ?? ''}`,
      lines,
    });
    toast.success(
      savedPicking
        ? 'Picking da rota atualizado no Scanner'
        : 'Lista enviada para o Picking do Scanner',
    );
  }

  const guidesJob = useMutation({
    mutationFn: () =>
      createTransportGuides({
        ids: chosenIds,
        addressFrom,
        plate,
        loadedAt: `${loadDate}T${loadTime}`,
      }),
    onSuccess: (res) => {
      setGuides(res.results);
      void fetchGuideHistory(vendaIds).then((r) => {
        const map: Record<string, GuideRecord> = {};
        for (const g of r.history) {
          const current = map[g.order_id];
          if (!current || g.version > current.version) map[g.order_id] = g;
        }
        setHistory(map);
      });
      const ok = res.results.filter((r) => r.ok).length;
      const fail = res.results.length - ok;
      if (ok > 0) toast.success(`${ok} guia(s) de transporte criada(s) em rascunho`);
      if (fail > 0) toast.error(`${fail} guia(s) falharam`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const alreadyIssued = useMemo(
    () => chosenStops.filter((s) => s.venda_id && history[s.venda_id]),
    [chosenStops, history],
  );

  function handleGuides() {
    if (chosenIds.length === 0) {
      toast.error('Selecione pelo menos uma nota');
      return;
    }
    if (new Date(`${loadDate}T${loadTime}`).getTime() < Date.now()) {
      toast.warning('Data de carga no passado — será ajustada para daqui a 15 minutos');
    }
    if (alreadyIssued.length > 0) {
      setConfirmReissue(true);
      return;
    }
    guidesJob.mutate();
  }

  function printGuidesDocument() {
    if (guides.filter((g) => g.ok).length === 0) {
      toast.error('Nenhuma guia emitida para imprimir');
      return;
    }
    setPrintDocs([]);
    setPrintMode('guides');
    runPrint();
  }

  const routeJob = useMutation({
    mutationFn: () =>
      buildDeliveryRoute({
        origin: addressFrom || DEFAULT_ADDRESS_FROM,
        stops: chosenStops.map((s) => ({
          id: s.id,
          label: `${s.venda_codigo ?? ''} · ${s.client_name}`,
          address: s.address ?? undefined,
        })),
      }),
    onSuccess: (plan) => {
      if (plan.ungeocoded.length > 0)
        toast.warning(`Moradas não localizadas: ${plan.ungeocoded.join(', ')}`);
      if (plan.legs.length === 0) {
        toast.error('Nenhuma morada encontrada nas notas selecionadas');
        return;
      }
      const links = plan.legs.map((leg) => {
        const origin = leg[0]!;
        const rest = leg.slice(1);
        const destination = rest[rest.length - 1] ?? origin;
        const waypoints = rest.slice(0, -1);
        const params = new URLSearchParams({ api: '1', travelmode: 'driving', origin, destination });
        if (waypoints.length > 0) params.set('waypoints', waypoints.join('|'));
        return `https://maps.google.com/maps/dir/?${params.toString()}`;
      });
      setRouteLinks(links);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function move(stopId: string, dir: -1 | 1) {
    const ids = stops.map((s) => s.id);
    const i = ids.indexOf(stopId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    reorder.mutate({ routeId, orderedIds: ids });
  }

  if (isLoading || !route) {
    return <p className="py-10 text-center text-sm text-muted-foreground">A carregar rota…</p>;
  }

  return (
    <div>
      <div className="no-print space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Rotas
          </Button>
          <div className="mr-auto">
            <h1 className="font-heading text-xl font-bold tracking-tight">{route.name}</h1>
            <p className="text-sm text-muted-foreground">
              {route.scheduled_date} · {stops.length} nota(s) · {totalItems} artigo(s) selecionados ·{' '}
              {plate || '—'}
            </p>
            {route.barcode && (
              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                Código da rota: {route.barcode} (ler no scanner para carregar)
              </p>
            )}
          </div>
          <Badge variant="secondary">{ROUTE_STATUS_LABELS[route.status] ?? route.status}</Badge>
          <Select
            value={route.status}
            onValueChange={(v) => updateRoute.mutate({ id: routeId, status: v as RouteStatus })}
          >
            <SelectTrigger className="h-9 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ROUTE_STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <RouteDriverCard
          routeId={routeId}
          driverId={route.driver_id}
          driverAssignedAt={route.driver_assigned_at}
          driverAssignedBy={route.driver_assigned_by}
        />

        <RoutePreparationCard
          routeId={routeId}
          preparationClosedAt={route.preparation_closed_at}
          compositionVersion={route.composition_version}
          financialStatus={route.financial_status}
        />

        {route.status === 'pending' && <AddRouteStops routeId={routeId} stops={stops} />}


        <section className="rounded-lg border border-border bg-card">
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
            <Checkbox
              checked={stops.length > 0 && stops.every((s) => selected[s.id])}
              onCheckedChange={(v) =>
                setSelected(Object.fromEntries(stops.map((s) => [s.id, Boolean(v)])))
              }
            />
            <span className="mr-auto text-sm text-muted-foreground">
              {chosenStops.length} de {stops.length} nota(s) · {totalPages} página(s) para imprimir
            </span>
            <Button onClick={printDocuments} disabled={docsQuery.isLoading}>
              <Printer className="mr-2 h-4 w-4" />
              {docsQuery.isLoading ? 'A obter notas…' : 'Imprimir documentos'}
            </Button>
            <Button variant="outline" onClick={() => routeJob.mutate()} disabled={routeJob.isPending}>
              <MapPin className="mr-2 h-4 w-4" />
              {routeJob.isPending ? 'A calcular…' : 'Abrir no Google Maps'}
            </Button>
          </div>

          {routeLinks.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-5 py-3">
              {routeLinks.map((url, i) => (
                <Button key={url} asChild variant="secondary" size="sm">
                  <a href={url} target="_blank" rel="noreferrer">
                    <MapPin className="mr-2 h-4 w-4" />
                    {routeLinks.length > 1 ? `Abrir troço ${i + 1}` : 'Abrir rota'}
                  </a>
                </Button>
              ))}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="w-10 px-5 py-2" />
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Nº</th>
                  <th className="px-3 py-2">Cliente</th>
                  <th className="px-3 py-2">Morada</th>
                  <th className="px-3 py-2">Situação</th>
                  <th className="px-3 py-2">Guia</th>
                  <th className="px-3 py-2">Cópias</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {stops.map((s, index) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="px-5 py-2">
                      <Checkbox
                        checked={Boolean(selected[s.id])}
                        onCheckedChange={(v) => setSelected((p) => ({ ...p, [s.id]: Boolean(v) }))}
                      />
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{index + 1}</td>
                    <td className="px-3 py-2 font-semibold">{s.venda_codigo || '—'}</td>
                    <td className="px-3 py-2">{s.client_name}</td>
                    <td className="max-w-[24rem] truncate px-3 py-2 text-muted-foreground">
                      {s.address || '—'}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{s.venda_status || '—'}</td>
                    <td className="px-3 py-2">
                      {s.venda_id && history[s.venda_id] ? (
                        <span className="text-amber-600">
                          Guia {history[s.venda_id]?.guide_number || '—'} ({history[s.venda_id]?.version}.ª via)
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Sem guia</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min={1}
                        className="h-8 w-20"
                        value={copies[s.id] ?? 1}
                        onChange={(e) =>
                          setCopies((p) => ({ ...p, [s.id]: Math.max(1, Number(e.target.value) || 1) }))
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => move(s.id, -1)} disabled={index === 0}>
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => move(s.id, 1)}
                          disabled={index === stops.length - 1}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeStop.mutate({ routeId, stopId: s.id })}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card">
          <div className="flex flex-wrap items-end gap-4 border-b border-border px-5 py-3">
            <h2 className="mr-auto text-sm font-semibold">Guias de Transporte (InvoiceXpress)</h2>
            <div className="grid gap-1.5">
              <Label htmlFor="rota-origem-guia">Local de carga</Label>
              <Input
                id="rota-origem-guia"
                className="h-9 w-80"
                value={addressFrom}
                onChange={(e) => setAddressFrom(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rota-matricula-guia">Carrinha</Label>
              <Select
                value={vehicleId}
                onValueChange={(id) => {
                  setVehicleId(id);
                  const v = vehicles.find((x) => x.id === id);
                  setPlate(vehiclePlate(v));
                  if (route) {
                    updateRoute.mutate({ id: route.id, vehicle_location_id: id });
                  }
                }}
              >
                <SelectTrigger id="rota-matricula-guia" className="h-9 w-48">
                  <SelectValue placeholder="Escolher carrinha" />
                </SelectTrigger>
                <SelectContent>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {vehiclePlate(v)} — {v.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rota-carga-data">Data de carga</Label>
              <Input
                id="rota-carga-data"
                type="date"
                className="h-9 w-40"
                value={loadDate}
                onChange={(e) => setLoadDate(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rota-carga-hora">Hora</Label>
              <Input
                id="rota-carga-hora"
                type="time"
                className="h-9 w-28"
                value={loadTime}
                onChange={(e) => setLoadTime(e.target.value)}
              />
            </div>
            <Button onClick={handleGuides} disabled={guidesJob.isPending}>
              <Truck className="mr-2 h-4 w-4" />
              {guidesJob.isPending ? 'A emitir…' : `Emitir guias (${chosenIds.length})`}
            </Button>
            <Button
              variant="outline"
              onClick={printGuidesDocument}
              disabled={guides.filter((g) => g.ok).length === 0}
            >
              <Printer className="mr-2 h-4 w-4" /> Documento de guias
            </Button>
          </div>
          {guides.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              Emita as guias de transporte das notas selecionadas nesta rota.
            </p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {guides.map((g) => (
                <li key={g.orderId} className="flex flex-wrap items-center gap-3 px-5 py-2">
                  <span className="font-semibold">{g.codigo}</span>
                  {g.ok ? (
                    <>
                      <span className="font-medium">
                        Guia n.º {g.guideNumber || (g.guideId ? `#${g.guideId}` : '—')}
                      </span>
                      <span className="text-muted-foreground">
                        Rascunho ·{' '}
                        {(g.version ?? 1) > 1 ? `${g.version}.ª via` : '1.ª via'}
                      </span>
                      {g.permalink ? (
                        <a className="ml-auto text-primary underline" href={g.permalink} target="_blank" rel="noreferrer">
                          Abrir
                        </a>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-destructive">{g.error}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-border bg-card">
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold">Relatório de Picking</h2>
            {savedPicking && (
              <Badge
                variant={savedPicking.progress === 'done' ? 'default' : 'secondary'}
                className={
                  savedPicking.progress === 'partial'
                    ? 'border-amber-300 bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                    : undefined
                }
              >
                {PICKING_PROGRESS_LABELS[savedPicking.progress]} · {savedPicking.picked}/
                {savedPicking.requested} un.
              </Badge>
            )}
            <label className="mr-auto flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <Checkbox checked={byCategory} onCheckedChange={(v) => setByCategory(Boolean(v))} />
              Separar por categoria
            </label>
            <Button variant="outline" onClick={() => void generatePicking()} disabled={docsQuery.isLoading}>
              <ListChecks className="mr-2 h-4 w-4" /> Gerar picking
            </Button>
            <Button variant="outline" onClick={() => void exportPicking()} disabled={pickingKept.length === 0}>
              <FileSpreadsheet className="mr-2 h-4 w-4" /> Exportar Excel
            </Button>
            <Button
              variant="outline"
              onClick={() => void sendToScanner()}
              disabled={pickingKept.length === 0 || savePicking.isPending}
            >
              <ScanBarcode className="mr-2 h-4 w-4" />
              {savePicking.isPending
                ? 'A guardar…'
                : savedPicking
                  ? 'Atualizar no Scanner'
                  : 'Enviar para o Scanner'}
            </Button>
            <Button onClick={printPickingReport} disabled={pickingKept.length === 0}>
              <Printer className="mr-2 h-4 w-4" /> Imprimir picking
            </Button>
          </div>
          {picking === null ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              Clique em "Gerar picking" para agrupar os artigos das notas selecionadas.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="w-10 px-5 py-2" />
                    <th className="px-3 py-2">Código</th>
                    <th className="px-3 py-2">Produto</th>
                    <th className="px-3 py-2">Detalhes</th>
                    <th className="px-3 py-2">Localização</th>
                    <th className="px-3 py-2">Encomendas</th>
                    <th className="px-3 py-2">Qtd. total</th>
                  </tr>
                </thead>
                <tbody>
                  {pickingRows.map((row) =>
                    row.type === 'cat' ? (
                      <tr key={`cat-${row.categoria}`} className="border-t border-border bg-muted/40">
                        <td className="px-5 py-2">
                          <Checkbox
                            checked={row.lines.every((l) => !excluded[l.key])}
                            onCheckedChange={(v) =>
                              setExcluded((prev) => ({
                                ...prev,
                                ...Object.fromEntries(row.lines.map((l) => [l.key, !v])),
                              }))
                            }
                          />
                        </td>
                        <td className="px-3 py-2 text-xs font-bold uppercase tracking-wide" colSpan={5}>
                          {row.categoria}
                        </td>
                        <td className="px-3 py-2 font-semibold">{row.quantidade}</td>
                      </tr>
                    ) : (
                      <tr
                        key={row.line.key}
                        className={`border-t border-border ${excluded[row.line.key] ? 'opacity-40' : ''}`}
                      >
                        <td className="px-5 py-2">
                          <Checkbox
                            checked={!excluded[row.line.key]}
                            onCheckedChange={(v) => setExcluded((prev) => ({ ...prev, [row.line.key]: !v }))}
                          />
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{row.line.codigo}</td>
                        <td className="px-3 py-2 font-medium">{row.line.nome}</td>
                        <td className="px-3 py-2 text-muted-foreground">{row.line.detalhes}</td>
                        <td className="px-3 py-2 text-muted-foreground">{row.line.localizacoes ?? '—'}</td>
                        <td className="px-3 py-2 text-muted-foreground">{row.line.encomendas.join(', ')}</td>
                        <td className="px-3 py-2 font-semibold">{row.line.quantidade}</td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
              <p className="border-t border-border px-5 py-3 text-sm text-muted-foreground">
                {pickingKept.length} artigo(s) ·{' '}
                {pickingKept.reduce((s, l) => s + l.quantidade, 0)} unidade(s) no picking
              </p>
            </div>
          )}
        </section>
      </div>

      <AlertDialog open={confirmReissue} onOpenChange={setConfirmReissue}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Já existem guias para estas notas</AlertDialogTitle>
            <AlertDialogDescription>
              {alreadyIssued
                .map((s) => `${s.venda_codigo} (guia ${history[s.venda_id!]?.guide_number || '—'})`)
                .join(', ')}
              . Ao continuar, serão emitidas como nova via por falta de entrega da via anterior.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => guidesJob.mutate()}>Emitir nova via</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div id="a4-sheet">
        {printMode === 'picking' ? (
          <PickingReport
            lines={pickingKept}
            from={route.scheduled_date}
            to={route.scheduled_date}
            orders={chosenStops.length}
            byCategory={byCategory}
          />
        ) : printMode === 'guides' ? (
          <GuidesDocument results={guides} plate={plate} addressFrom={addressFrom} />
        ) : (
          printDocs.map((doc, i) => <OrderDocument key={`${doc.id}-${i}`} doc={doc} />)
        )}
      </div>
    </div>
  );
}
