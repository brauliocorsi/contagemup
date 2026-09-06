import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CloudOff,
  Loader2,
  Minus,
  Plus,
  Save,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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
import { ScanInput } from '@/components/scanner/ScanInput';
import { ScanDock, type LastScan } from '@/components/scanner/ScanDock';
import { useAuth } from '@/hooks/useAuth';
import {
  FAILURE_REASONS,
  useAttemptLines,
  useConfirmAttempt,
  useStartAttempt,
  type DeliveryAttempt,
  type DeliveryAttemptLine,
} from '@/hooks/useDeliveryAttempts';
import {
  clearDraft,
  loadDraft,
  newDraft,
  parseLabel,
  saveDraft,
  type DeliveryDraft,
} from '@/lib/delivery/draft';
import { PaymentPanel } from '@/components/driver/PaymentPanel';
import { AssistanceDialog } from '@/components/driver/AssistanceDialog';
import { toast } from 'sonner';

interface Props {
  attempt: DeliveryAttempt;
  onBack: () => void;
}

type Step = 'artigos' | 'motivo' | 'resumo';

export function DeliveryExecution({ attempt, onBack }: Props) {
  const { user } = useAuth();
  const uid = user?.id ?? 'anon';
  const { data: lines = [], isLoading } = useAttemptLines(attempt.id);
  const start = useStartAttempt();
  const confirm = useConfirmAttempt();

  const [draft, setDraft] = useState<DeliveryDraft>(() => loadDraft(uid, attempt.id) ?? newDraft());
  const [step, setStep] = useState<Step>('artigos');
  const [last, setLast] = useState<LastScan | null>(null);
  const [ambiguous, setAmbiguous] = useState<DeliveryAttemptLine[] | null>(null);
  const [askConfirm, setAskConfirm] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!startedRef.current && attempt.status === 'assigned') {
      startedRef.current = true;
      start.mutate(attempt.id);
    }
  }, [attempt.id, attempt.status, start]);

  const persist = useCallback(
    (next: DeliveryDraft) => {
      setDraft(next);
      saveDraft(uid, attempt.id, next);
    },
    [uid, attempt.id],
  );

  const qtyOf = useCallback((id: string) => draft.quantities[id] ?? 0, [draft.quantities]);

  const setQty = useCallback(
    (line: DeliveryAttemptLine, value: number) => {
      const clamped = Math.max(0, Math.min(line.loaded_quantity, value));
      if (value > line.loaded_quantity) {
        toast.error(`Só há ${line.loaded_quantity} un. desta caixa nesta entrega.`);
      }
      persist({ ...draft, quantities: { ...draft.quantities, [line.id]: clamped } });
    },
    [draft, persist],
  );

  const applyScan = useCallback(
    (line: DeliveryAttemptLine) => {
      const current = draft.quantities[line.id] ?? 0;
      if (current >= line.loaded_quantity) {
        setLast({
          kind: 'erro',
          title: line.product_name,
          detail: `Caixa ${line.colis_number} já está toda confirmada`,
          quantity: `${current} / ${line.loaded_quantity}`,
        });
        return;
      }
      const next = current + 1;
      persist({ ...draft, quantities: { ...draft.quantities, [line.id]: next } });
      setLast({
        kind: 'produto',
        title: line.product_name,
        detail: `${line.product_code} • caixa ${line.colis_number}`,
        quantity: `${next} / ${line.loaded_quantity}`,
        remaining: `faltam ${line.loaded_quantity - next}`,
      });
    },
    [draft, persist],
  );

  const handleScan = useCallback(
    (raw: string) => {
      const { code, coli } = parseLabel(raw);
      const candidates = lines.filter(
        (l) =>
          l.loaded_quantity > 0 &&
          l.product_code.trim().toUpperCase() === code &&
          (coli === null || l.colis_number === coli),
      );
      if (candidates.length === 0) {
        setLast({ kind: 'erro', title: 'Não pertence a esta entrega', detail: raw });
        return;
      }
      // uma etiqueta sem número de caixa, ou repetida em caixas diferentes, obriga a escolher
      if (candidates.length > 1) {
        setAmbiguous(candidates);
        setLast({ kind: 'erro', title: 'Escolha a caixa', detail: raw });
        return;
      }
      applyScan(candidates[0]);
    },
    [lines, applyScan],
  );

  const totals = useMemo(() => {
    const loaded = lines.reduce((s, l) => s + l.loaded_quantity, 0);
    const delivered = lines.reduce((s, l) => s + qtyOf(l.id), 0);
    return { loaded, delivered, pending: loaded - delivered };
  }, [lines, qtyOf]);

  const needsReason = totals.pending > 0;
  const reasonOk =
    !needsReason ||
    (!!draft.failureReason && (draft.failureReason !== 'outro' || draft.failureNotes.trim().length > 2));

  const submit = async () => {
    const payload = lines.map((l) => ({
      line_id: l.id,
      delivered_quantity: qtyOf(l.id),
      reason: draft.reasons[l.id] ?? null,
    }));
    persist({ ...draft, pendingSend: true });
    try {
      const r = await confirm.mutateAsync({
        attemptId: attempt.id,
        lines: payload,
        failureReason: draft.failureReason,
        failureNotes: draft.failureNotes,
        opKey: draft.opKey,
        version: attempt.version,
      });
      clearDraft(uid, attempt.id);
      toast.success(
        r.outcome === 'delivered_full'
          ? 'Entrega confirmada por completo'
          : r.outcome === 'delivered_partial'
            ? `Entrega parcial gravada: ${r.delivered} un. entregues, ${r.return_expected} a devolver`
            : 'Registado como não entregue',
      );
      onBack();
    } catch {
      // o rascunho fica marcado como "por enviar" — nada foi dado como entregue
      persist({ ...draft, pendingSend: true });
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-28">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Voltar">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <p className="truncate text-lg font-bold leading-tight">{attempt.client_name || 'Cliente'}</p>
          <p className="truncate text-xs text-muted-foreground">
            Encomenda {attempt.order_number} • tentativa {attempt.attempt_number}
          </p>
        </div>
      </div>

      {attempt.address && (
        <Card>
          <CardContent className="space-y-1 p-3 text-sm">
            <p>{attempt.address}</p>
            {attempt.delivery_instructions && (
              <p className="text-xs text-muted-foreground">{attempt.delivery_instructions}</p>
            )}
          </CardContent>
        </Card>
      )}

      {attempt.partial_load && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/50 bg-warning-soft p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div>
            <p className="font-medium">Esta carga saiu incompleta do armazém.</p>
            <p className="text-xs text-muted-foreground">
              Entregue apenas o que está na lista. O que falta é responsabilidade do armazém
              {attempt.partial_load_reason ? ` (${attempt.partial_load_reason})` : ''}.
            </p>
          </div>
        </div>
      )}

      {draft.pendingSend && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm">
          <CloudOff className="h-4 w-4 text-destructive" />
          <span>Há uma confirmação por enviar. Reenvie quando tiver rede — não fica duplicada.</span>
        </div>
      )}

      {step === 'artigos' && (
        <>
          <ScanDock
            last={last}
            progress={{ done: totals.delivered, total: totals.loaded, label: 'Confirmado' }}
          >
            <ScanInput onScan={handleScan} placeholder="Ler etiqueta do artigo…" />
          </ScanDock>

          <div className="space-y-2">
            {lines.map((l) => {
              const q = qtyOf(l.id);
              return (
                <Card key={l.id}>
                  <CardContent className="flex items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{l.product_name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {l.product_code} • caixa {l.colis_number} de {l.ordered_quantity} pedida(s)
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-9 w-9"
                        aria-label="Menos"
                        onClick={() => setQty(l, q - 1)}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <span className="w-16 text-center text-lg font-bold tabular-nums">
                        {q}/{l.loaded_quantity}
                      </span>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-9 w-9"
                        aria-label="Mais"
                        onClick={() => setQty(l, q + 1)}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {lines.length === 0 && (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Esta entrega não tem artigos carregados.
              </p>
            )}
          </div>
        </>
      )}

      {step === 'motivo' && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div>
              <Label>Motivo do que não foi entregue</Label>
              <Select
                value={draft.failureReason ?? ''}
                onValueChange={(v) => persist({ ...draft, failureReason: v })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Escolher motivo" />
                </SelectTrigger>
                <SelectContent>
                  {FAILURE_REASONS.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea
                className="mt-1"
                rows={3}
                value={draft.failureNotes}
                onChange={(e) => persist({ ...draft, failureNotes: e.target.value })}
                placeholder="O que aconteceu"
              />
            </div>
            {draft.failureReason === 'pedido_cancelamento' && (
              <p className="rounded-lg bg-muted p-2 text-xs text-muted-foreground">
                Fica registado como pedido do cliente. O cancelamento só é decidido pelo responsável.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {step === 'resumo' && (
        <Card>
          <CardContent className="space-y-3 p-4 text-sm">
            <p className="font-semibold">Resumo antes de gravar</p>
            <ul className="space-y-1">
              {lines.map((l) => (
                <li key={l.id} className="flex justify-between gap-2">
                  <span className="min-w-0 truncate">
                    {l.product_name} (caixa {l.colis_number})
                  </span>
                  <span className="shrink-0 tabular-nums">
                    entregue {qtyOf(l.id)} / carregado {l.loaded_quantity}
                  </span>
                </li>
              ))}
            </ul>
            <div className="rounded-lg bg-muted p-3">
              <p>Entregue: <strong>{totals.delivered}</strong> un.</p>
              <p>Volta na viatura: <strong>{totals.pending}</strong> un.</p>
              {needsReason && (
                <p className="text-xs text-muted-foreground">
                  Motivo: {FAILURE_REASONS.find((r) => r.id === draft.failureReason)?.label ?? '—'}
                </p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              O que não é entregue fica como devolução pendente até ser conferido no armazém.
            </p>
          </CardContent>
        </Card>
      )}

      {step === 'resumo' && (
        <>
          <PaymentPanel attemptId={attempt.id} />
          <AssistanceDialog attempt={attempt} lines={lines} />
        </>
      )}

      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 p-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl gap-2">
          {step !== 'artigos' && (
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setStep(step === 'resumo' ? (needsReason ? 'motivo' : 'artigos') : 'artigos')}
            >
              Voltar
            </Button>
          )}
          {step === 'artigos' && (
            <Button className="flex-1" onClick={() => setStep(needsReason ? 'motivo' : 'resumo')}>
              Continuar
            </Button>
          )}
          {step === 'motivo' && (
            <Button
              className="flex-1"
              disabled={!reasonOk}
              onClick={() => setStep('resumo')}
            >
              Continuar
            </Button>
          )}
          {step === 'resumo' && (
            <Button
              className="flex-1"
              disabled={confirm.isPending || !reasonOk}
              onClick={() => setAskConfirm(true)}
            >
              {confirm.isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-1 h-4 w-4" />
              )}
              Confirmar entrega
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Guardar rascunho"
            onClick={() => {
              persist(draft);
              toast.success('Guardado neste telemóvel');
            }}
          >
            <Save className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <AlertDialog open={!!ambiguous} onOpenChange={(o) => !o && setAmbiguous(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Qual caixa leu?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta etiqueta pode ser de mais do que uma caixa desta entrega.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            {(ambiguous ?? []).map((l) => (
              <Button
                key={l.id}
                variant="outline"
                className="w-full justify-between"
                onClick={() => {
                  applyScan(l);
                  setAmbiguous(null);
                }}
              >
                <span className="truncate">{l.product_name}</span>
                <Badge variant="secondary">caixa {l.colis_number}</Badge>
              </Button>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={askConfirm} onOpenChange={setAskConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gravar esta entrega?</AlertDialogTitle>
            <AlertDialogDescription>
              {totals.delivered} un. entregues e {totals.pending} un. de volta na viatura.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                setAskConfirm(false);
                void submit();
              }}
            >
              Gravar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
