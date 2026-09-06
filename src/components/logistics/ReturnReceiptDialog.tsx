import { useEffect, useMemo, useState } from 'react';
import { Loader2, Undo2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { LocationSelect } from '@/components/counting/LocationSelect';
import {
  pendingReturn,
  useAttemptLines,
  useReceiveReturn,
  type DeliveryAttempt,
} from '@/hooks/useDeliveryAttempts';
import { useTypedLocations } from '@/hooks/useDeliveryNotes';

interface Props {
  attempt: DeliveryAttempt | null;
  onOpenChange: (o: boolean) => void;
}

/** Conferência física do que volta na viatura: apto para armazém, avariado para quarentena. */
export function ReturnReceiptDialog({ attempt, onOpenChange }: Props) {
  const { data: lines = [], isLoading } = useAttemptLines(attempt?.id ?? null);
  const { data: quarantines = [] } = useTypedLocations('quarantine');
  const receive = useReceiveReturn();
  const [ok, setOk] = useState<Record<string, number>>({});
  const [dam, setDam] = useState<Record<string, number>>({});
  const [dest, setDest] = useState('');
  const [quarantine, setQuarantine] = useState('');

  useEffect(() => {
    setOk({});
    setDam({});
  }, [attempt?.id]);

  useEffect(() => {
    if (!quarantine && quarantines[0]) setQuarantine(quarantines[0].code);
  }, [quarantines, quarantine]);

  const pending = useMemo(() => lines.filter((l) => pendingReturn(l) > 0), [lines]);
  const totalExpected = pending.reduce((s, l) => s + pendingReturn(l), 0);
  const totalGiven = pending.reduce((s, l) => s + (ok[l.id] ?? 0) + (dam[l.id] ?? 0), 0);
  const difference = totalExpected - totalGiven;

  const submit = async () => {
    if (!attempt) return;
    const payload = pending
      .filter((l) => (ok[l.id] ?? 0) > 0 || (dam[l.id] ?? 0) > 0)
      .map((l) => ({
        line_id: l.id,
        quantity_ok: ok[l.id] ?? 0,
        quantity_damaged: dam[l.id] ?? 0,
        location: dest || null,
      }));
    await receive.mutateAsync({
      attemptId: attempt.id,
      lines: payload,
      quarantineLocation: quarantine || 'QUARENTENA-DEV',
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={!!attempt} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Conferir retorno — {attempt?.order_number}</DialogTitle>
          <DialogDescription>
            Só depois desta conferência a mercadoria volta a existir no armazém. O que estiver
            avariado fica em quarentena e não fica disponível.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
        ) : pending.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Não há mercadoria pendente de retorno nesta tentativa.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Destino do que está bom</Label>
                <div className="mt-1">
                  <LocationSelect value={dest} onValueChange={setDest} placeholder="Escolher localização" />
                </div>
              </div>
              <div>
                <Label>Quarentena (avariado)</Label>
                <div className="mt-1">
                  <LocationSelect
                    value={quarantine}
                    onValueChange={setQuarantine}
                    placeholder="Zona de quarentena"
                  />
                </div>
              </div>
            </div>

            {pending.map((l) => {
              const exp = pendingReturn(l);
              return (
                <div key={l.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{l.product_name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {l.product_code} • caixa {l.colis_number}
                    </p>
                  </div>
                  <Badge variant="secondary">esperado {exp}</Badge>
                  <div className="flex items-center gap-1">
                    <Label className="text-xs">Bom</Label>
                    <Input
                      type="number"
                      min={0}
                      max={exp}
                      className="h-8 w-16"
                      value={ok[l.id] ?? 0}
                      onChange={(e) =>
                        setOk({ ...ok, [l.id]: Math.max(0, Math.min(exp, Number(e.target.value) || 0)) })
                      }
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <Label className="text-xs">Avariado</Label>
                    <Input
                      type="number"
                      min={0}
                      max={exp}
                      className="h-8 w-16"
                      value={dam[l.id] ?? 0}
                      onChange={(e) =>
                        setDam({ ...dam, [l.id]: Math.max(0, Math.min(exp, Number(e.target.value) || 0)) })
                      }
                    />
                  </div>
                </div>
              );
            })}

            {difference !== 0 && (
              <p className="rounded-lg border border-warning/50 bg-warning-soft p-3 text-sm">
                Diferença de {difference} un. face ao esperado. Fica registada como exceção por
                explicar — não é regularizada em silêncio.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button disabled={receive.isPending || totalGiven === 0} onClick={() => void submit()}>
            {receive.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Undo2 className="mr-1 h-4 w-4" />
            )}
            Registar retorno
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
