import { useMemo, useState } from 'react';
import { Truck, CheckCircle2, Loader2, FileText, PackageCheck, AlertCircle, Lock } from 'lucide-react';
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

  const note = notes.find((n) => n.id === noteId) ?? null;
  const noteItems = useMemo(
    () => items.filter((i) => i.note_id === noteId),
    [items, noteId],
  );

  const ready = !!vehicle && !!note && noteConfirmed;

  const selectVehicle = (code: string) => {
    setVehicle(code);
    setNoteConfirmed(false);
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

    // leitura de viatura
    const veh = vehicles.find((v) => v.code.trim().toLowerCase() === value);
    if (veh) {
      selectVehicle(veh.code);
      toast.success(`Viatura: ${veh.code}`);
      return;
    }
    if (!vehicle) {
      toast.error('Escolha ou leia primeiro a viatura de destino');
      return;
    }
    if (!note) {
      toast.error('Escolha primeiro a nota de encomenda');
      return;
    }
    if (!noteConfirmed) {
      toast.error(`Confirme a nota ${note.order_number} antes de carregar`);
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
      toast.error('Escolha a viatura de destino');
      return;
    }
    if (!note) {
      toast.error('Escolha a nota de encomenda');
      return;
    }
    if (!noteConfirmed) {
      toast.error(`Confirme a nota ${note.order_number} antes de carregar`);
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
  };


  return (
    <div className="space-y-4">
      <ScanInput onScan={handleScan} placeholder="Ler viatura ou artigo…" />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
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
            <FileText className="h-4 w-4" /> Notas no cais
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {!vehicle && (
            <p className="rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">
              Escolha a viatura de destino para poder selecionar uma nota.
            </p>
          )}
          {isLoading ? (
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
          ) : notes.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
              Nenhuma nota no cais de carga.
            </p>
          ) : (
            notes.map((n) => (
              <button
                key={n.id}
                disabled={!vehicle}
                onClick={() => {
                  setNoteId(n.id === noteId ? null : n.id);
                  setChecked({});
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
              <PackageCheck className="h-4 w-4" /> Nota {note.order_number}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!noteConfirmed ? (
              <div className="space-y-2 rounded-lg border border-dashed p-3">
                <p className="text-xs text-muted-foreground">
                  Confirme que esta é a nota a carregar para <strong>{vehicle || 'a viatura'}</strong>.
                  Só depois é possível conferir artigos e mover do cais para a carrinha.
                </p>
                <Button
                  className="w-full"
                  disabled={!vehicle}
                  onClick={() => {
                    setNoteConfirmed(true);
                    toast.success(`Nota ${note.order_number} confirmada`);
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
