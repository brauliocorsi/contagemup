import { useMemo, useState } from 'react';
import { Truck, CheckCircle2, Loader2, FileText, PackageCheck, AlertCircle, Lock, Route as RouteIcon, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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

/** Conferência de carregamento: cais -> carrinha, por nota ou artigo a artigo. */
export function LoadingModule({ onCommand }: Props) {
  const { data: vehicles = [] } = useTypedLocations('transport');
  const { data: notes = [], isLoading } = useDeliveryNotes('staged');
  const noteIds = useMemo(() => notes.map((n) => n.id), [notes]);
  const { data: items = [] } = useDeliveryNoteItems(noteIds);
  const loadNotes = useLoadNotesToVehicle();

  const [vehicle, setVehicle] = useState('');
  const [noteId, setNoteId] = useState<string | null>(null);
  /** Nota de encomenda confirmada pelo operador antes de carregar. */
  const [noteConfirmed, setNoteConfirmed] = useState(false);
  /** Conferência local (por artigo) antes de confirmar. */
  const [checked, setChecked] = useState<Record<string, number>>({});
  /** Rota lida por código de barras (ROTA-XXXXXX): filtra as notas do cais. */
  const [route, setRoute] = useState<ScannedRoute | null>(null);
  const [loadingRoute, setLoadingRoute] = useState(false);

  const visibleNotes = useMemo(
    () => (route ? notes.filter((n) => n.route_id === route.id) : notes),
    [notes, route],
  );
  /** A carrinha lida é diferente da definida na rota? */
  const vehicleMismatch = Boolean(
    route?.vehicle_code && vehicle && route.vehicle_code !== vehicle,
  );

  const note = notes.find((n) => n.id === noteId) ?? null;
  const noteItems = useMemo(
    () => items.filter((i) => i.note_id === noteId),
    [items, noteId],
  );

  const ready = !!vehicle && !!note && noteConfirmed;

  const selectVehicle = (code: string) => {
    setVehicle(code);
    setNoteConfirmed(false);
    toast.info(`Viatura ${code} selecionada. Agora escolha a nota de encomenda.`, {
      duration: 3000,
    });
  };

  const selectRouteByBarcode = async (code: string) => {
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
      setChecked({});
      setNoteConfirmed(false);
      if (vehicleCode && !vehicle) {
        setVehicle(vehicleCode);
      }
      toast.success(`Rota ${data.name} selecionada`, {
        description: vehicleCode
          ? `Carrinha definida na rota: ${vehicleCode}.`
          : 'Esta rota não tem carrinha definida.',
      });
    } catch (e) {
      toast.error('Não foi possível ler a rota');
    } finally {
      setLoadingRoute(false);
    }
  };

  /** Carrega de uma vez todas as notas do cais que pertencem à rota lida. */
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
    await loadNotes.mutateAsync({ noteIds: ids, vehicleLocation: vehicle, items: undefined });
    setChecked({});
    setNoteId(null);
    setNoteConfirmed(false);
    toast.success(`Rota carregada (${ids.length} notas)`, {
      description: `Stock movido do cais para ${vehicle}.`,
    });
  };

  const totals = useMemo(() => {
    const requested = noteItems.reduce(
      (s, i) => s + Math.max(i.staged_quantity - i.loaded_quantity, 0),
      0,
    );
    const done = noteItems.reduce((s, i) => s + (checked[i.id] ?? 0), 0);
    return { requested, done, pct: requested ? Math.round((done / requested) * 100) : 0 };
  }, [noteItems, checked]);

  const handleScan = (raw: string) => {
    if (onCommand?.(raw)) return;
    const value = parseScan(raw).value.trim().toLowerCase();

    // leitura de rota (ROTA-XXXXXX)
    if (value.startsWith('rota-')) {
      void selectRouteByBarcode(parseScan(raw).value.trim().toUpperCase());
      return;
    }

    // leitura de viatura
    const veh = vehicles.find((v) => v.code.trim().toLowerCase() === value);
    if (veh) {
      selectVehicle(veh.code);
      return;
    }
    if (!vehicle) {
      toast.error('Carregamento bloqueado', {
        description: 'Escolha ou leia primeiro a viatura de destino.',
        duration: 5000,
      });
      return;
    }
    if (!note) {
      toast.error('Carregamento bloqueado', {
        description: 'Escolha a nota de encomenda que está no cais.',
        duration: 5000,
      });
      return;
    }
    if (!noteConfirmed) {
      toast.error(`Confirme a nota ${note.order_number}`, {
        description: 'Prima "Confirmar nota de encomenda" antes de conferir artigos.',
        duration: 5000,
      });
      return;
    }
    const base = value.split('-c')[0];
    const match = noteItems.find(
      (i) =>
        i.product_code.trim().toLowerCase() === value ||
        i.product_code.trim().toLowerCase() === base ||
        i.product_name.trim().toLowerCase() === value,
    );
    if (!match) {
      toast.error(`"${value}" não pertence à nota ${note.order_number}`);
      return;
    }
    const max = Math.max(match.staged_quantity - match.loaded_quantity, 0);
    const next = Math.min(max, (checked[match.id] ?? 0) + 1);
    if (next === (checked[match.id] ?? 0)) {
      toast.warning(`${match.product_name} já está completo`);
      return;
    }
    setChecked((prev) => ({ ...prev, [match.id]: next }));
    toast.success(`${match.product_name}: ${next}/${max}`);
  };

  const confirm = async (mode: 'scanned' | 'full') => {
    if (!vehicle) {
      toast.error('Carregamento bloqueado', {
        description: 'Selecione a viatura de destino.',
      });
      return;
    }
    if (!note) {
      toast.error('Carregamento bloqueado', {
        description: 'Selecione a nota de encomenda.',
      });
      return;
    }
    if (!noteConfirmed) {
      toast.error(`Confirme a nota ${note.order_number}`, {
        description: 'A nota tem de ser confirmada antes de carregar.',
      });
      return;
    }
    const payload =
      mode === 'full'
        ? undefined
        : noteItems
            .map((i) => ({ item_id: i.id, quantity: checked[i.id] ?? 0 }))
            .filter((i) => i.quantity > 0);
    if (mode === 'scanned' && (!payload || payload.length === 0)) {
      toast.error('Nenhum artigo conferido');
      return;
    }
    await loadNotes.mutateAsync({ noteIds: [note.id], vehicleLocation: vehicle, items: payload });
    setChecked({});
    setNoteId(null);
    setNoteConfirmed(false);
    toast.success('Nota carregada', {
      description: `Stock movido do cais para ${vehicle}.`,
    });
  };

  return (
    <div className="space-y-4">
      <ScanInput onScan={handleScan} placeholder="Ler rota, viatura ou artigo…" />

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
                  setRoute(null);
                  setNoteId(null);
                  setChecked({});
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
                Confira nota a nota: o carregamento da rota completa é feito pelo responsável.
              </p>
            ) : (
              <Button
                className="w-full"
                disabled={loadNotes.isPending || !vehicle || visibleNotes.length === 0}
                onClick={() => void loadWholeRoute()}
              >
                {loadNotes.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Truck className="mr-2 h-4 w-4" />
                )}
                Carregar rota completa
              </Button>
            )}

          </CardContent>
        </Card>
      )}

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/50 dark:bg-amber-950/20">
        <p className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            O carregamento só é permitido nesta ordem:{' '}
            <strong>1. Viatura</strong> → <strong>2. Nota</strong> →{' '}
            <strong>3. Confirmar nota</strong>.
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
                  setNoteId(n.id === noteId ? null : n.id);
                  setChecked({});
                  setNoteConfirmed(false);
                  if (n.id !== noteId) {
                    toast.info(`Nota ${n.order_number} selecionada. Confirme-a no passo 3.`, {
                      duration: 3000,
                    });
                  }
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
              <PackageCheck className="h-4 w-4" /> Nota {note.order_number}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!noteConfirmed ? (
              <div className="space-y-2 rounded-lg border border-dashed p-3">
                <p className="text-xs text-muted-foreground">
                  Confirme que esta é a nota a carregar para{' '}
                  <strong>{vehicle || 'a viatura'}</strong>. Só depois é possível conferir artigos e
                  mover do cais para a carrinha.
                </p>
                {!vehicle && (
                  <p className="text-[11px] text-destructive">
                    <Lock className="mr-1 inline h-3 w-3" />
                    Confirmação bloqueada enquanto não escolher a viatura.
                  </p>
                )}
                <Button
                  className="w-full"
                  disabled={!vehicle}
                  onClick={() => {
                    setNoteConfirmed(true);
                    toast.success(`Nota ${note.order_number} confirmada`, {
                      description: 'Já pode conferir artigos e carregar.',
                    });
                  }}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Confirmar nota de encomenda
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between rounded-md bg-muted px-2 py-1">
                <span className="text-[11px] text-muted-foreground">
                  Nota confirmada para {vehicle}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => setNoteConfirmed(false)}
                >
                  Alterar
                </Button>
              </div>
            )}

            {!ready && note && (
              <p className="flex items-center gap-2 rounded-md bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
                <Lock className="h-3 w-3" />
                <span>
                  {!vehicle
                    ? 'Carregamento bloqueado: escolha a viatura.'
                    : !noteConfirmed
                      ? 'Carregamento bloqueado: confirme a nota.'
                      : 'Carregamento bloqueado.'}
                </span>
              </p>
            )}

            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Conferido</span>
                <span>
                  {totals.done}/{totals.requested} un.
                </span>
              </div>
              <Progress value={totals.pct} />
            </div>

            {noteItems.map((i) => {
              const max = Math.max(i.staged_quantity - i.loaded_quantity, 0);
              const done = checked[i.id] ?? 0;
              return (
                <div
                  key={i.id}
                  className={`rounded-lg border p-2 ${done >= max && max > 0 ? 'border-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/20' : ''}`}
                >
                  <p className="truncate text-xs font-medium">{i.product_name}</p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">
                    {i.product_code || 'sem código'} • {i.location || '—'}
                  </p>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">
                      {done}/{max} un.
                    </span>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px]"
                        disabled={!ready}
                        onClick={() =>
                          setChecked((p) => ({ ...p, [i.id]: Math.max(0, (p[i.id] ?? 0) - 1) }))
                        }
                      >
                        −
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px]"
                        disabled={!ready}
                        onClick={() =>
                          setChecked((p) => ({ ...p, [i.id]: Math.min(max, (p[i.id] ?? 0) + 1) }))
                        }
                      >
                        +
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="grid gap-2">
              <Button
                className="w-full"
                disabled={loadNotes.isPending || !ready || totals.done === 0}
                onClick={() => void confirm('scanned')}
              >
                {loadNotes.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                Carregar conferidos
              </Button>
              <Button
                variant="outline"
                className="w-full"
                disabled={loadNotes.isPending || !ready}
                onClick={() => void confirm('full')}
              >
                Carregar nota completa
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

