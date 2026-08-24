import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { FileSpreadsheet, ListChecks, MapPin, Printer, ScanBarcode, Search, Truck } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
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
import { buildPicking, exportPickingXlsx, groupByCategory, type PickingLine } from '@/lib/logistics/picking';
import { attachPickingLocations } from '@/lib/logistics/pickingLocations';
import {
  buildDeliveryRoute,
  createTransportGuides,
  fetchGuideHistory,
  fetchOrderDocuments,
  fetchSeparationOrders,
} from '@/lib/logistics/api';
import {
  DEFAULT_ADDRESS_FROM,
  PLATES,
  type GcDocument,
  type GuideRecord,
  type GuideResult,
  type SepOrder,
} from '@/lib/logistics/types';

function today(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

export function SeparationNotesView() {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today(7));
  const [orders, setOrders] = useState<SepOrder[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [copies, setCopies] = useState<Record<string, number>>({});
  const [docs, setDocs] = useState<GcDocument[]>([]);
  const [picking, setPicking] = useState<PickingLine[] | null>(null);
  const [excluded, setExcluded] = useState<Record<string, boolean>>({});
  const [printMode, setPrintMode] = useState<'docs' | 'picking' | 'guides'>('docs');
  const [byCategory, setByCategory] = useState(false);
  const [addressFrom, setAddressFrom] = useState(DEFAULT_ADDRESS_FROM);
  const [plate, setPlate] = useState<string>(PLATES[0]);
  const [loadDate, setLoadDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [loadTime, setLoadTime] = useState('08:00');
  const [guides, setGuides] = useState<GuideResult[]>([]);
  const [history, setHistory] = useState<Record<string, GuideRecord>>({});
  const [confirmReissue, setConfirmReissue] = useState(false);
  const [routeLinks, setRouteLinks] = useState<string[]>([]);

  async function refreshHistory(ids: string[]) {
    if (ids.length === 0) {
      setHistory({});
      return;
    }
    try {
      const res = await fetchGuideHistory(ids);
      const map: Record<string, GuideRecord> = {};
      for (const g of res.history) {
        const current = map[g.order_id];
        if (!current || g.version > current.version) map[g.order_id] = g;
      }
      setHistory(map);
    } catch {
      /* histórico é informativo */
    }
  }

  const query = useMutation({
    mutationFn: () => fetchSeparationOrders(from, to),
    onSuccess: (res) => {
      setOrders(res.orders);
      setSelected(Object.fromEntries(res.orders.map((o) => [o.id, true])));
      setCopies({});
      setDocs([]);
      setPicking(null);
      setExcluded({});
      setGuides([]);
      void refreshHistory(res.orders.map((o) => o.id));
      toast.success(`${res.orders.length} encomenda(s) com entrega neste período`);
      if (res.truncated) toast.warning('Muitos registos: alguns podem faltar. Reduza o período.');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    const raw = localStorage.getItem('separacao:preselect');
    if (!raw) return;
    localStorage.removeItem('separacao:preselect');
    try {
      const data = JSON.parse(raw) as { from: string; to: string; ids: string[] };
      if (data.from) setFrom(data.from);
      if (data.to) setTo(data.to);
      void (async () => {
        const res = await fetchSeparationOrders(data.from, data.to);
        setOrders(res.orders);
        const ids = new Set(data.ids ?? []);
        setSelected(Object.fromEntries(res.orders.map((o) => [o.id, ids.has(o.id)])));
        void refreshHistory(res.orders.map((o) => o.id));
        toast.success(`${ids.size} nota(s) recebidas da otimização da semana`);
      })();
    } catch {
      /* pré-seleção inválida */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chosen = useMemo(() => orders.filter((o) => selected[o.id]), [orders, selected]);
  const totalPages = useMemo(
    () => chosen.reduce((sum, o) => sum + Math.max(1, copies[o.id] ?? 1), 0),
    [chosen, copies],
  );
  const allChecked = orders.length > 0 && orders.every((o) => selected[o.id]);

  const routeJob = useMutation({
    mutationFn: () =>
      buildDeliveryRoute({
        origin: addressFrom || DEFAULT_ADDRESS_FROM,
        stops: chosen.map((o) => ({ id: o.id, label: `${o.codigo} · ${o.cliente}`, address: o.morada })),
      }),
    onSuccess: (plan) => {
      if (plan.ungeocoded.length > 0)
        toast.warning(`Moradas não localizadas: ${plan.ungeocoded.join(', ')}`);
      if (plan.legs.length === 0) {
        toast.error('Nenhuma morada encontrada nas encomendas selecionadas');
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
      if (links.length > 1) toast.info(`Rota dividida em ${links.length} troços (limite do Google Maps).`);
      else toast.success('Rota pronta — abre no Google Maps');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const printJob = useMutation({
    mutationFn: async () => {
      const res = await fetchOrderDocuments(chosen.map((o) => o.id));
      const byId = new Map(res.documents.map((d) => [d.id, d]));
      return chosen.flatMap((o) => {
        const doc = byId.get(o.id);
        if (!doc) return [];
        return Array.from({ length: Math.max(1, copies[o.id] ?? 1) }, () => doc);
      });
    },
    onSuccess: (pages) => {
      if (pages.length === 0) {
        toast.error('Não foi possível obter as notas na Gestão Click');
        return;
      }
      setPrintMode('docs');
      setDocs(pages);
      runPrint();
    },
    onError: (e: Error) => toast.error(e.message),
  });

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

  function handlePrint() {
    if (chosen.length === 0) {
      toast.error('Selecione pelo menos uma encomenda');
      return;
    }
    printJob.mutate();
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
    if (chosen.length === 0) {
      toast.error('Selecione pelo menos uma encomenda');
      return;
    }
    const lines = buildPicking(chosen);
    setPicking(lines);
    setExcluded({});
    toast.success(`${lines.length} artigo(s) no picking`);
    try {
      const withLocations = await attachPickingLocations(lines);
      setPicking(withLocations);
    } catch {
      toast.error('Não foi possível carregar as localizações');
    }
  }

  function printPickingReport() {
    if (pickingKept.length === 0) {
      toast.error('Nenhum artigo no picking');
      return;
    }
    setDocs([]);
    setPrintMode('picking');
    runPrint();
  }

  async function exportPicking() {
    if (pickingKept.length === 0) {
      toast.error('Nenhum artigo no picking');
      return;
    }
    await exportPickingXlsx(pickingKept, from, to, byCategory);
    toast.success('Ficheiro Excel gerado');
  }

  const guidesJob = useMutation({
    mutationFn: () =>
      createTransportGuides({
        ids: chosen.map((o) => o.id),
        addressFrom,
        plate,
        loadedAt: `${loadDate}T${loadTime}`,
      }),
    onSuccess: (res) => {
      setGuides(res.results);
      void refreshHistory(orders.map((o) => o.id));
      const ok = res.results.filter((r) => r.ok).length;
      const fail = res.results.length - ok;
      if (ok > 0) toast.success(`${ok} guia(s) de transporte criada(s) em rascunho`);
      if (fail > 0) toast.error(`${fail} guia(s) falharam`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const alreadyIssued = useMemo(() => chosen.filter((o) => history[o.id]), [chosen, history]);

  function handleGuides() {
    if (chosen.length === 0) {
      toast.error('Selecione pelo menos uma encomenda');
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
    setDocs([]);
    setPrintMode('guides');
    runPrint();
  }

  return (
    <div>
      <div className="no-print space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="mr-auto">
            <h1 className="font-heading text-xl font-bold tracking-tight">Notas de Separação</h1>
            <p className="text-sm text-muted-foreground">
              Gestão Click · impressão A4 por data de entrega
            </p>
          </div>
          <Button onClick={handlePrint} disabled={printJob.isPending}>
            <Printer className="mr-2 h-4 w-4" />
            {printJob.isPending ? 'A obter notas…' : `Imprimir ${totalPages > 0 ? `(${totalPages})` : ''}`}
          </Button>
        </div>

        <section className="rounded-lg border border-border bg-card p-5">
          <div className="flex flex-wrap items-end gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="de">Entrega de</Label>
              <Input id="de" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ate">Entrega até</Label>
              <Input id="ate" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <Button onClick={() => query.mutate()} disabled={query.isPending}>
              <Search className="mr-2 h-4 w-4" />
              {query.isPending ? 'A carregar…' : 'Carregar encomendas'}
            </Button>
            <Button
              variant="outline"
              onClick={() => routeJob.mutate()}
              disabled={routeJob.isPending || chosen.length === 0}
            >
              <MapPin className="mr-2 h-4 w-4" />
              {routeJob.isPending ? 'A calcular rota…' : `Rota no Google Maps (${chosen.length})`}
            </Button>
          </div>
          {routeLinks.length > 0 && (
            <div className="mt-4 space-y-2 rounded-md border border-border bg-muted/40 p-4">
              <div className="flex flex-wrap items-center gap-2">
                {routeLinks.map((url, i) => (
                  <div key={url} className="flex items-center gap-1">
                    <Button asChild variant="secondary" size="sm">
                      <a href={url} target="_blank" rel="noreferrer">
                        <MapPin className="mr-2 h-4 w-4" />
                        {routeLinks.length > 1 ? `Abrir troço ${i + 1}` : 'Abrir rota'}
                      </a>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        void navigator.clipboard.writeText(url);
                        toast.success('Link copiado');
                      }}
                    >
                      Copiar link
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-border bg-card">
          <div className="flex items-center gap-3 border-b border-border px-5 py-3">
            <Checkbox
              checked={allChecked}
              onCheckedChange={(v) =>
                setSelected(Object.fromEntries(orders.map((o) => [o.id, Boolean(v)])))
              }
            />
            <span className="text-sm text-muted-foreground">
              {orders.length} encomenda(s) · {totalPages} nota(s) para imprimir
            </span>
          </div>
          {orders.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              Escolha um período de entrega e carregue as encomendas.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="w-10 px-5 py-2" />
                    <th className="px-3 py-2">Nº</th>
                    <th className="px-3 py-2">Entrega</th>
                    <th className="px-3 py-2">Cliente</th>
                    <th className="px-3 py-2">Situação</th>
                    <th className="px-3 py-2">Artigos</th>
                    <th className="px-3 py-2">Guia</th>
                    <th className="px-3 py-2">Cópias</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="border-t border-border">
                      <td className="px-5 py-2">
                        <Checkbox
                          checked={Boolean(selected[o.id])}
                          onCheckedChange={(v) => setSelected((prev) => ({ ...prev, [o.id]: Boolean(v) }))}
                        />
                      </td>
                      <td className="px-3 py-2 font-semibold">{o.codigo}</td>
                      <td className="px-3 py-2">{o.entrega}</td>
                      <td className="px-3 py-2">{o.cliente}</td>
                      <td className="px-3 py-2">{o.situacao}</td>
                      <td className="px-3 py-2">{o.produtos.length}</td>
                      <td className="px-3 py-2">
                        {history[o.id] ? (
                          <span className="text-amber-600">
                            Guia {history[o.id]?.guide_number || '—'} ({history[o.id]?.version}.ª via)
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
                          value={copies[o.id] ?? 1}
                          onChange={(e) =>
                            setCopies((prev) => ({
                              ...prev,
                              [o.id]: Math.max(1, Number(e.target.value) || 1),
                            }))
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-border bg-card">
          <div className="flex flex-wrap items-end gap-4 border-b border-border px-5 py-3">
            <h2 className="mr-auto text-sm font-semibold">Guias de Transporte (InvoiceXpress)</h2>
            <div className="grid gap-1.5">
              <Label htmlFor="origem">Local de carga</Label>
              <Input
                id="origem"
                className="h-9 w-80"
                placeholder={DEFAULT_ADDRESS_FROM}
                value={addressFrom}
                onChange={(e) => setAddressFrom(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="matricula">Matrícula</Label>
              <Select value={plate} onValueChange={setPlate}>
                <SelectTrigger id="matricula" className="h-9 w-36">
                  <SelectValue placeholder="Matrícula" />
                </SelectTrigger>
                <SelectContent>
                  {PLATES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="carga-data">Data de carga</Label>
              <Input
                id="carga-data"
                type="date"
                className="h-9 w-40"
                value={loadDate}
                onChange={(e) => setLoadDate(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="carga-hora">Hora</Label>
              <Input
                id="carga-hora"
                type="time"
                className="h-9 w-28"
                value={loadTime}
                onChange={(e) => setLoadTime(e.target.value)}
              />
            </div>
            <Button onClick={handleGuides} disabled={guidesJob.isPending}>
              <Truck className="mr-2 h-4 w-4" />
              {guidesJob.isPending ? 'A emitir…' : `Emitir guias (${chosen.length})`}
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
              Seleciona as encomendas acima e emite as guias de transporte em rascunho na InvoiceXpress.
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
                        {(g.version ?? 1) > 1
                          ? `${g.version}.ª via por falta de entrega${g.previousGuideNumber ? ` (anterior ${g.previousGuideNumber})` : ''}`
                          : '1.ª via'}
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
            <label className="mr-auto flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <Checkbox checked={byCategory} onCheckedChange={(v) => setByCategory(Boolean(v))} />
              Separar por categoria
            </label>
            <Button variant="outline" onClick={() => void generatePicking()}>
              <ListChecks className="mr-2 h-4 w-4" /> Gerar picking
            </Button>
            <Button variant="outline" onClick={() => void exportPicking()} disabled={pickingKept.length === 0}>
              <FileSpreadsheet className="mr-2 h-4 w-4" /> Exportar Excel
            </Button>
            <Button
              variant="outline"
              onClick={() => void sendToScanner()}
              disabled={pickingKept.length === 0 || createTask.isPending}
            >
              <ScanBarcode className="mr-2 h-4 w-4" />
              {createTask.isPending ? 'A enviar…' : 'Enviar para o Scanner'}
            </Button>
            <Button onClick={printPickingReport} disabled={pickingKept.length === 0}>
              <Printer className="mr-2 h-4 w-4" /> Imprimir picking
            </Button>

          </div>
          {picking === null ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              Selecione as encomendas e clique em "Gerar picking" para agrupar os artigos.
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
                {pickingKept.length} artigo(s) · {pickingKept.reduce((s, l) => s + l.quantidade, 0)} unidade(s) no
                picking
              </p>
            </div>
          )}
        </section>
      </div>

      <AlertDialog open={confirmReissue} onOpenChange={setConfirmReissue}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Já existem guias para estas encomendas</AlertDialogTitle>
            <AlertDialogDescription>
              {alreadyIssued.map((o) => `${o.codigo} (guia ${history[o.id]?.guide_number || '—'})`).join(', ')}. Ao
              continuar, serão emitidas como nova via por falta de entrega da via anterior.
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
          <PickingReport lines={pickingKept} from={from} to={to} orders={chosen.length} byCategory={byCategory} />
        ) : printMode === 'guides' ? (
          <GuidesDocument results={guides} plate={plate} addressFrom={addressFrom} />
        ) : (
          docs.map((doc, i) => <OrderDocument key={`${doc.id}-${i}`} doc={doc} />)
        )}
      </div>
    </div>
  );
}
