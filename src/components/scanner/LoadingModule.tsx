import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Truck,
  CheckCircle2,
  Loader2,
  FileText,
  PackageCheck,
  AlertCircle,
  Lock,
  Route as RouteIcon,
  X,
  Boxes,
  Save,
  CloudUpload,
  AlertTriangle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScanInput } from './ScanInput';
import { parseScan, type QtyHandler } from '@/lib/scanner/commands';
import { toast } from 'sonner';
import {
  useDeliveryNotes,
  useDeliveryNoteItems,
  useLoadNotesToVehicle,
  useTypedLocations,
} from '@/hooks/useDeliveryNotes';
import { supabase } from '@/integrations/supabase/client';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { useAuth } from '@/hooks/useAuth';
import { useNoteItemColis, useLoadNotesColis, type LoadColiResult } from '@/hooks/useColisOperations';
import {
  addColiScan,
  completeSets,
  evaluateColiScan,
  linePending,
  setColiScan,
  slotPending,
  splitColisSuffix,
  type ColiLine,
} from '@/lib/scanner/coliCounter';
import {
  clearOpDraft,
  loadOpDraft,
  newOpKey,
  purgeForeignOpDrafts,
  saveOpDraft,
  type DraftStatus,
} from '@/lib/scanner/opDraft';

interface ScannedRoute {
  id: string;
  name: string;
  barcode: string | null;
  vehicle_location_id: string | null;
  vehicle_code: string | null;
}

interface Props {
  onCommand?: (raw: string) => boolean;
  registerQtyHandler?: (handler: QtyHandler | null) => void;
}

/** Conferência de carregamento volume a volume: cais -> carrinha. */
export function LoadingModule({ onCommand }: Props) {
  const { data: vehicles = [] } = useTypedLocations('transport');
  const { data: notes = [], isLoading } = useDeliveryNotes('staged');
  const noteIds = useMemo(() => notes.map((n) => n.id), [notes]);
  const { data: items = [] } = useDeliveryNoteItems(noteIds);
  const loadAggregated = useLoadNotesToVehicle();
  const loadColis = useLoadNotesColis();
  const { isWarehouseOperator } = useRoleAccess();
  const { user } = useAuth();

  const [vehicle, setVehicle] = useState('');
  const [noteId, setNoteId] = useState<string | null>(null);
  const [noteConfirmed, setNoteConfirmed] = useState(false);
  const [route, setRoute] = useState<ScannedRoute | null>(null);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [status, setStatus] = useState<DraftStatus>('gravado');
  const [result, setResult] = useState<LoadColiResult | null>(null);
  /** Conferido por artigo e volume, ainda por gravar. */
  const [scanned, setScanned] = useState<Record<string, Record<number, number>>>({});

  const note = notes.find((n) => n.id === noteId) ?? null;
  const noteItems = useMemo(() => items.filter((i) => i.note_id === noteId), [items, noteId]);
  const noteItemIds = useMemo(() => noteItems.map((i) => i.id), [noteItems]);
  const { data: colis = [] } = useNoteItemColis(noteItemIds);

  const context = `loading:${noteId ?? 'nenhuma'}:${vehicle || 'sem-viatura'}`;
  const opKeyRef = useRef<string>(newOpKey('vehicle_load_colis'));

  useEffect(() => {
    purgeForeignOpDrafts(user?.id ?? null);
  }, [user?.id]);

  /** Recupera o rascunho deste utilizador para esta nota + viatura. */
  useEffect(() => {
    if (!user?.id || !noteId || !vehicle) return;
    const draft = loadOpDraft<{ opKey: string; scanned: Record<string, Record<number, number>> }>(
      user.id,
      context,
    );
    if (draft) {
      opKeyRef.current = draft.opKey;
      setScanned(draft.data.scanned ?? {});
      setStatus(draft.status);
    } else {
      opKeyRef.current = newOpKey('vehicle_load_colis');
      setScanned({});
      setStatus('gravado');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, context]);

  const pendingWork = useMemo(
    () =>
      Object.values(scanned).reduce(
        (t, m) => t + Object.values(m).reduce((a, b) => a + b, 0),
        0,
      ),
    [scanned],
  );

  useEffect(() => {
    if (!user?.id || !noteId || !vehicle) return;
    saveOpDraft({
      opKey: opKeyRef.current,
      userId: user.id,
      context,
      status: pendingWork > 0 ? status : 'gravado',
      updatedAt: Date.now(),
      data: { opKey: opKeyRef.current, scanned },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanned, status, user?.id, context]);

  /** Linhas com o previsto por volume (o que está no cais e ainda não foi carregado). */
  const coliLines = useMemo((): ColiLine[] => {
    return noteItems.map((i) => {
      const rows = colis.filter((c) => c.note_item_id === i.id);
      const slots = (rows.length
        ? rows
        : [
            {
              colis_number: 1,
              staged_quantity: i.staged_quantity,
              loaded_quantity: i.loaded_quantity,
              requested_quantity: i.quantity,
              location: i.location,
              evidence: 'sem_projecao',
            } as any,
          ]
      )
        .slice()
        .sort((a, b) => a.colis_number - b.colis_number)
        .map((c) => ({
          colis_number: c.colis_number,
          requested: Math.max(c.staged_quantity, 0),
          done: Math.max(c.loaded_quantity, 0),
          scanned: scanned[i.id]?.[c.colis_number] ?? 0,
          location: c.location,
          evidence: c.evidence,
        }));
      return {
        key: i.id,
        label: i.product_name,
        orderNumber: note?.order_number ?? null,
        aliases: [i.product_code, i.product_name].filter(Boolean),
        slots,
      };
    });
  }, [noteItems, colis, scanned, note?.order_number]);

  const coliLinesRef = useRef(coliLines);
  coliLinesRef.current = coliLines;

  const visibleNotes = useMemo(
    () => (route ? notes.filter((n) => n.route_id === route.id) : notes),
    [notes, route],
  );
  const vehicleMismatch = Boolean(route?.vehicle_code && vehicle && route.vehicle_code !== vehicle);
  const ready = !!vehicle && !!note && noteConfirmed;

  /** Trocar de contexto com trabalho por gravar exige decisão explícita. */
  const guardPending = (what: string) => {
    if (pendingWork === 0) return true;
    toast.error(`Tem ${pendingWork} volume(s) conferidos por gravar`, {
      description: `Grave ou limpe a conferência antes de mudar ${what}.`,
    });
    return false;
  };

  const selectVehicle = (code: string) => {
    if (code !== vehicle && !guardPending('de viatura')) return;
    setVehicle(code);
    setNoteConfirmed(false);
    toast.info(`Viatura ${code} selecionada. Agora escolha a nota de encomenda.`, { duration: 3000 });
  };

  const selectRouteByBarcode = async (code: string) => {
    if (!guardPending('de rota')) return;
    setLoadingRoute(true);
    try {
      const { data, error } = await supabase
        .from('route_schedules')
        .select('id, name, barcode, vehicle_location_id')
        .eq('barcode', code)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        toast.error(`Rota "${code}" não encontrada`);
        return;
      }
      let vehicleCode: string | null = null;
      if (data.vehicle_location_id) {
        const { data: loc } = await supabase
          .from('warehouse_locations')
          .select('code')
          .eq('id', data.vehicle_location_id)
          .maybeSingle();
        vehicleCode = loc?.code ?? null;
      }
      setRoute({ ...data, vehicle_code: vehicleCode } as ScannedRoute);
      setNoteId(null);
      setScanned({});
      setNoteConfirmed(false);
      if (vehicleCode && !vehicle) setVehicle(vehicleCode);
      toast.success(`Rota ${data.name} selecionada`, {
        description: vehicleCode
          ? `Carrinha definida na rota: ${vehicleCode}.`
          : 'Esta rota não tem carrinha definida.',
      });
    } catch {
      toast.error('Não foi possível ler a rota');
    } finally {
      setLoadingRoute(false);
    }
  };

  /** Caminho de escritório: carrega a rota inteira sem conferência (vedado ao operador). */
  const loadWholeRoute = async () => {
    if (!vehicle) {
      toast.error('Escolha a viatura de destino.');
      return;
    }
    const ids = visibleNotes.map((n) => n.id);
    if (ids.length === 0) {
      toast.error('Esta rota não tem notas no cais.');
      return;
    }
    await loadAggregated.mutateAsync({ noteIds: ids, vehicleLocation: vehicle, items: undefined });
    setScanned({});
    setNoteId(null);
    setNoteConfirmed(false);
  };

  const totals = useMemo(() => {
    const requested = coliLines.reduce((s, l) => s + l.slots.reduce((t, x) => t + x.requested, 0), 0);
    const loaded = coliLines.reduce((s, l) => s + l.slots.reduce((t, x) => t + x.done, 0), 0);
    const done = coliLines.reduce((s, l) => s + l.slots.reduce((t, x) => t + x.done + x.scanned, 0), 0);
    return { requested, loaded, done, pct: requested ? Math.round((done / requested) * 100) : 0 };
  }, [coliLines]);

  const [choice, setChoice] = useState<{ lineKey: string; options: number[] } | null>(null);

  const applyScan = useCallback((lineKey: string, colisNumber: number, qty = 1) => {
    setScanned((prev) => {
      const line = coliLinesRef.current.find((l) => l.key === lineKey);
      const slot = line?.slots.find((s) => s.colis_number === colisNumber);
      if (!slot) return prev;
      const room = slotPending(slot);
      if (room <= 0) {
        toast.warning('Este volume já está todo carregado');
        return prev;
      }
      const cur = prev[lineKey]?.[colisNumber] ?? 0;
      return { ...prev, [lineKey]: { ...(prev[lineKey] ?? {}), [colisNumber]: cur + Math.min(qty, room) } };
    });
    setStatus('por_guardar');
  }, []);

  const handleScan = (raw: string) => {
    if (onCommand?.(raw)) return;
    const value = parseScan(raw).value.trim();
    const lower = value.toLowerCase();

    if (lower.startsWith('rota-')) {
      void selectRouteByBarcode(value.toUpperCase());
      return;
    }
    const veh = vehicles.find((v) => v.code.trim().toLowerCase() === lower);
    if (veh) {
      selectVehicle(veh.code);
      return;
    }
    if (!vehicle) {
      toast.error('Carregamento bloqueado', { description: 'Leia primeiro a viatura de destino.' });
      return;
    }
    if (!note) {
      toast.error('Carregamento bloqueado', { description: 'Escolha a nota de encomenda no cais.' });
      return;
    }
    if (!noteConfirmed) {
      toast.error(`Confirme a nota ${note.order_number}`, {
        description: 'Prima "Confirmar nota de encomenda" antes de conferir volumes.',
      });
      return;
    }

    const { base, colis: n } = splitColisSuffix(value);
    const outcome = evaluateColiScan(coliLinesRef.current, base, n);
    switch (outcome.status) {
      case 'desconhecido':
        toast.error(`"${base}" não pertence à nota ${note.order_number}`);
        return;
      case 'completo':
        toast.warning(n ? `Volume C${n} já está carregado` : 'Este artigo já está todo carregado');
        return;
      case 'escolher_linha':
        setChoice({ lineKey: outcome.candidates[0].key, options: [] });
        toast.info('Há mais do que uma linha com este artigo — escolha na lista abaixo.');
        return;
      case 'escolher_coli':
        setChoice({ lineKey: outcome.lineKey, options: outcome.options });
        toast.info('Produto de vários volumes — indique qual está a carregar.');
        return;
      case 'ok':
        applyScan(outcome.lineKey, outcome.colis);
        toast.success(`Volume C${outcome.colis} conferido`);
        return;
    }
  };

  const confirm = async () => {
    if (!ready || !note) {
      toast.error('Carregamento bloqueado', {
        description: !vehicle ? 'Selecione a viatura.' : 'Confirme a nota de encomenda.',
      });
      return;
    }
    const lines = coliLines
      .map((l) => ({
        note_item_id: l.key,
        colis: l.slots
          .filter((s) => s.scanned > 0)
          .map((s) => ({ colis_number: s.colis_number, quantity: s.scanned })),
      }))
      .filter((l) => l.colis.length > 0);
    if (lines.length === 0) {
      toast.error('Nenhum volume conferido');
      return;
    }
    setStatus('a_enviar');
    try {
      const res = await loadColis.mutateAsync({ vehicle, lines, opKey: opKeyRef.current });
      setResult(res);
      setStatus('gravado');
      setScanned({});
      clearOpDraft(user?.id, context);
      opKeyRef.current = newOpKey('vehicle_load_colis');
      const pend = (res.lines ?? []).flatMap((l) => (l.pending ?? []).filter((p) => p.pending > 0));
      toast.success(`${res.volumes_loaded} volume(s) carregados na ${res.vehicle}`, {
        description: pend.length
          ? `Ainda faltam ${pend.reduce((t, p) => t + p.pending, 0)} volume(s) no cais.`
          : 'Nota totalmente carregada.',
      });
    } catch (e: any) {
      console.error(e);
      setStatus('erro');
      toast.error('Erro ao carregar: ' + (e?.message ?? ''), {
        description: 'A conferência ficou guardada. Confirme outra vez para reenviar a mesma operação.',
      });
    }
  };

  const statusBadge = () => {
    const map: Record<DraftStatus, { label: string; cls: string; icon: typeof Save }> = {
      por_guardar: { label: 'Por guardar', cls: 'border-amber-400 text-amber-700', icon: Save },
      a_enviar: { label: 'A enviar…', cls: 'border-primary text-primary', icon: CloudUpload },
      gravado: { label: 'Gravado', cls: 'border-emerald-400 text-emerald-700', icon: CheckCircle2 },
      erro: { label: 'Erro — reenviar', cls: 'border-destructive text-destructive', icon: AlertTriangle },
    };
    const s = map[status];
    const Icon = s.icon;
    return (
      <Badge variant="outline" className={`gap-1 text-[10px] ${s.cls}`}>
        <Icon className="h-3 w-3" /> {s.label}
      </Badge>
    );
  };

  return (
    <div className="space-y-4">
      <ScanInput onScan={handleScan} placeholder="Ler rota, viatura ou volume (CÓDIGO-C1)…" />

      {loadingRoute && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> A procurar a rota…
        </p>
      )}

      {route && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="space-y-2 p-3">
            <div className="flex items-center gap-2">
              <RouteIcon className="h-4 w-4 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{route.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {route.barcode} • {visibleNotes.length} nota(s) no cais •{' '}
                  {route.vehicle_code ? `Carrinha: ${route.vehicle_code}` : 'Sem carrinha definida'}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2"
                onClick={() => {
                  if (!guardPending('de rota')) return;
                  setRoute(null);
                  setNoteId(null);
                  setScanned({});
                  setNoteConfirmed(false);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {vehicleMismatch && (
              <p className="flex items-start gap-2 rounded-md bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Atenção: está a carregar para <strong>{vehicle}</strong>, mas esta rota está
                  definida para <strong>{route.vehicle_code}</strong>.
                </span>
              </p>
            )}

            {isWarehouseOperator ? (
              <p className="rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                Confira volume a volume: o carregamento da rota completa é feito pelo responsável.
              </p>
            ) : (
              <Button
                className="w-full"
                disabled={loadAggregated.isPending || !vehicle || visibleNotes.length === 0}
                onClick={() => void loadWholeRoute()}
              >
                {loadAggregated.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Truck className="mr-2 h-4 w-4" />
                )}
                Carregar rota completa (sem conferência)
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/50 dark:bg-amber-950/20">
        <p className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Ordem obrigatória: <strong>1. Viatura</strong> → <strong>2. Nota</strong> →{' '}
            <strong>3. Confirmar nota</strong> → <strong>4. Ler cada volume</strong>.
          </span>
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              1
            </span>
            <Truck className="h-4 w-4" /> Viatura de destino
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={vehicle} onValueChange={selectVehicle}>
            <SelectTrigger>
              <SelectValue placeholder="Escolher carrinha" />
            </SelectTrigger>
            <SelectContent>
              {vehicles.map((v) => (
                <SelectItem key={v.id} value={v.code}>
                  {v.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {vehicles.length === 0 && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Configure localizações do tipo "Transporte" em Armazém › Configurar › Localizações.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className={!vehicle ? 'opacity-60' : undefined}>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              2
            </span>
            <FileText className="h-4 w-4" /> Notas no cais
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {!vehicle && (
            <p className="flex items-center gap-2 rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">
              <Lock className="h-3 w-3" />
              <span>Escolha primeiro a viatura para ver as notas disponíveis.</span>
            </p>
          )}
          {isLoading ? (
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
          ) : visibleNotes.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
              {route ? 'Esta rota não tem notas no cais.' : 'Nenhuma nota no cais de carga.'}
            </p>
          ) : (
            visibleNotes.map((n) => (
              <button
                key={n.id}
                disabled={!vehicle}
                onClick={() => {
                  if (!guardPending('de nota')) return;
                  setNoteId(n.id === noteId ? null : n.id);
                  setScanned({});
                  setResult(null);
                  setNoteConfirmed(false);
                }}
                className={`flex w-full items-center gap-2 rounded-lg border p-2 text-left disabled:cursor-not-allowed disabled:opacity-60 ${
                  n.id === noteId ? 'border-primary bg-primary/5' : ''
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{n.order_number}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {n.client_name || 'Sem cliente'} • {n.dock_location || '—'}
                  </p>
                </div>
                <Badge variant="secondary">No cais</Badge>
              </button>
            ))
          )}
        </CardContent>
      </Card>

      {note && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                3
              </span>
              <PackageCheck className="h-4 w-4" /> Nota {note.order_number} {statusBadge()}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!noteConfirmed ? (
              <div className="space-y-2 rounded-lg border border-dashed p-3">
                <p className="text-xs text-muted-foreground">
                  Confirme que esta é a nota a carregar para <strong>{vehicle || 'a viatura'}</strong>.
                </p>
                <Button
                  className="w-full"
                  disabled={!vehicle}
                  onClick={() => setNoteConfirmed(true)}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Confirmar nota de encomenda
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between rounded-md bg-muted px-2 py-1">
                <span className="text-[11px] text-muted-foreground">Nota confirmada para {vehicle}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => guardPending('de nota') && setNoteConfirmed(false)}
                >
                  Alterar
                </Button>
              </div>
            )}

            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Volumes</span>
                <span>
                  {totals.done}/{totals.requested} (já carregados {totals.loaded})
                </span>
              </div>
              <Progress value={totals.pct} />
            </div>

            {choice && (
              <div className="space-y-2 rounded-lg border border-primary p-2">
                <p className="text-xs font-semibold">Qual o volume?</p>
                {choice.options.map((n) => (
                  <Button
                    key={n}
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      applyScan(choice.lineKey, n);
                      setChoice(null);
                    }}
                  >
                    Volume C{n}
                  </Button>
                ))}
                <Button variant="ghost" className="w-full" onClick={() => setChoice(null)}>
                  Cancelar leitura
                </Button>
              </div>
            )}

            {coliLines.map((l) => {
              const item = noteItems.find((i) => i.id === l.key);
              const legacy = l.slots.some((s) => s.evidence && s.evidence !== 'scan');
              return (
                <div
                  key={l.key}
                  className={`rounded-lg border p-2 ${
                    linePending(l) === 0 ? 'border-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/20' : ''
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{l.label}</p>
                      <p className="truncate font-mono text-[11px] text-muted-foreground">
                        {item?.product_code || 'sem código'} • cais {note.dock_location || '—'}
                      </p>
                      {legacy && (
                        <Badge variant="outline" className="mt-1 gap-1 border-amber-400 text-[10px] text-amber-700">
                          <AlertTriangle className="h-3 w-3" /> sem prova de leitura — reconferir
                        </Badge>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[10px] uppercase text-muted-foreground">Conjuntos</p>
                      <Badge variant="secondary">{completeSets(l)}</Badge>
                    </div>
                  </div>

                  <div className="mt-2 space-y-1 border-t pt-2">
                    <p className="flex items-center gap-1 text-[10px] uppercase text-muted-foreground">
                      <Boxes className="h-3 w-3" /> Volume a volume
                    </p>
                    {l.slots.map((s) => (
                      <div key={s.colis_number} className="flex items-center gap-2">
                        <Badge variant="outline" className="w-14 justify-center text-[10px]">
                          C{s.colis_number}/{l.slots.length}
                        </Badge>
                        <span className="flex-1 text-[11px] text-muted-foreground">
                          previsto {s.requested} · carregado {s.done}
                          {s.scanned ? ` + ${s.scanned} por gravar` : ''} · falta {slotPending(s)}
                        </span>
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-7 w-7"
                          disabled={!ready}
                          onClick={() =>
                            setScanned((p) => ({
                              ...p,
                              [l.key]: { ...(p[l.key] ?? {}), [s.colis_number]: Math.max(0, (p[l.key]?.[s.colis_number] ?? 0) - 1) },
                            }))
                          }
                        >
                          −
                        </Button>
                        <Input
                          type="number"
                          min={0}
                          className="h-7 w-14 text-center text-xs"
                          value={s.scanned}
                          disabled={!ready}
                          onChange={(e) =>
                            setScanned((p) => ({
                              ...p,
                              [l.key]: {
                                ...(p[l.key] ?? {}),
                                [s.colis_number]: Math.max(
                                  0,
                                  Math.min(Math.max(s.requested - s.done, 0), Number(e.target.value) || 0),
                                ),
                              },
                            }))
                          }
                        />
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-7 w-7"
                          disabled={!ready}
                          onClick={() => applyScan(l.key, s.colis_number, 1)}
                        >
                          +
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            <Button
              className="w-full"
              disabled={loadColis.isPending || !ready || pendingWork === 0}
              onClick={() => void confirm()}
            >
              {loadColis.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              Carregar volumes conferidos
            </Button>

            {result && (
              <div className="space-y-1 rounded-lg border border-emerald-300 bg-emerald-50/60 p-2 dark:bg-emerald-950/20">
                <p className="text-[11px] font-semibold">
                  Carregado: {result.volumes_loaded} volume(s) na {result.vehicle}
                </p>
                {(result.lines ?? []).map((l) => (
                  <p key={l.note_item_id} className="text-[11px] text-muted-foreground">
                    {l.order_number} · {(l.colis ?? []).map((c) => `C${c.colis_number}×${c.loaded}`).join(' ')} ·{' '}
                    {(l.pending ?? []).filter((p) => p.pending > 0).length
                      ? `falta ${(l.pending ?? [])
                          .filter((p) => p.pending > 0)
                          .map((p) => `C${p.colis_number}×${p.pending}`)
                          .join(' ')}`
                      : 'completo'}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
