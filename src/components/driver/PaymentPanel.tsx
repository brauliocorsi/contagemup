import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BadgeEuro, CheckCircle2, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  useAttemptAmountDue,
  useAttemptPayments,
  useDeclarePayments,
  usePaymentMethods,
  type PaymentLineInput,
} from '@/hooks/useDeliveryFinance';
import { centsToInput, formatCents, parseEurosToCents } from '@/lib/finance/money';

interface Props {
  attemptId: string;
  /** o entregador só declara valores das suas entregas autorizadas */
  disabled?: boolean;
}

interface DraftLine {
  key: string;
  method_id: string;
  amount: string;
  gross: string;
  reference: string;
}

const storageKey = (a: string) => `payment_draft:${a}`;

/**
 * Recebimento na entrega. O que aqui é declarado é "realizado declarado pelo
 * entregador" — não é conferência do financeiro nem confirmação bancária.
 */
export function PaymentPanel({ attemptId, disabled }: Props) {
  const { data: due, isLoading } = useAttemptAmountDue(attemptId);
  const { data: methods = [] } = usePaymentMethods();
  const { data: existing = [] } = useAttemptPayments(attemptId);
  const declare = useDeclarePayments();

  const [lines, setLines] = useState<DraftLine[]>([]);
  const [reason, setReason] = useState('');
  const [opKey] = useState(() => {
    const saved = localStorage.getItem(storageKey(attemptId) + ':op');
    if (saved) return saved;
    const k = crypto.randomUUID();
    localStorage.setItem(storageKey(attemptId) + ':op', k);
    return k;
  });

  useEffect(() => {
    const raw = localStorage.getItem(storageKey(attemptId));
    if (raw) {
      try {
        const p = JSON.parse(raw) as { lines: DraftLine[]; reason: string };
        setLines(p.lines ?? []);
        setReason(p.reason ?? '');
        return;
      } catch {
        /* rascunho ilegível */
      }
    }
    if (existing.length > 0) {
      setLines(
        existing.map((p) => ({
          key: p.id,
          method_id: p.method_id,
          amount: centsToInput(p.amount_cents),
          gross: p.gross_cents ? centsToInput(p.gross_cents) : '',
          reference: p.reference ?? '',
        })),
      );
      setReason(existing[0]?.difference_reason ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId, existing.length]);

  const persist = (next: DraftLine[], nextReason = reason) => {
    setLines(next);
    setReason(nextReason);
    localStorage.setItem(storageKey(attemptId), JSON.stringify({ lines: next, reason: nextReason }));
  };

  const parsed = useMemo(
    () =>
      lines.map((l) => ({
        ...l,
        cents: parseEurosToCents(l.amount),
        grossCents: l.gross ? parseEurosToCents(l.gross) : null,
      })),
    [lines],
  );
  const total = parsed.reduce((s, l) => s + (l.cents ?? 0), 0);
  const invalid = parsed.some((l) => l.cents === null || (l.gross && l.grossCents === null));
  const locked = existing.some((p) => p.locked);

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!due?.has_previsto) {
    return (
      <Card className="border-warning/50 bg-warning/5">
        <CardContent className="flex items-start gap-2 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <span>
            Ainda não foram importados os valores desta encomenda. Não cobre nada sem falar com o
            responsável — o valor <strong>não é zero</strong>, está apenas por confirmar.
          </span>
        </CardContent>
      </Card>
    );
  }

  const difference = total - due.due_cents;

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="space-y-1 p-4">
          <div className="flex items-center gap-2">
            <BadgeEuro className="h-4 w-4 text-primary" />
            <span className="font-semibold">
              {due.due_cents > 0
                ? `A receber nesta entrega: ${formatCents(due.due_cents)}`
                : 'Pago no GestãoClick — apenas entregar'}
            </span>
          </div>
          {due.already_paid_cents > 0 && (
            <p className="text-xs text-muted-foreground">
              Já pago antes da entrega: {formatCents(due.already_paid_cents)}
            </p>
          )}
          {due.paid_previous_attempts_cents > 0 && (
            <p className="text-xs text-muted-foreground">
              Recebido em tentativa anterior: {formatCents(due.paid_previous_attempts_cents)} — não
              volta a ser cobrado.
            </p>
          )}
          {due.override_cents !== null && (
            <Badge variant="outline">Valor ajustado pelo responsável para esta entrega</Badge>
          )}
          {due.unknown_parcels > 0 && (
            <p className="flex items-start gap-1 text-xs text-warning">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              {due.unknown_parcels} parcela(s) por rever no escritório. Em caso de dúvida não cobre.
            </p>
          )}
        </CardContent>
      </Card>

      {locked ? (
        <Card className="border-success/40 bg-success/5">
          <CardContent className="space-y-1 p-4 text-sm">
            <div className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="h-4 w-4 text-success" /> Recebimento já entregue nas contas
              da rota
            </div>
            {existing.map((p) => (
              <p key={p.id} className="text-xs text-muted-foreground">
                {methods.find((m) => m.id === p.method_id)?.label ?? p.method_id}:{' '}
                {formatCents(p.amount_cents)}
              </p>
            ))}
          </CardContent>
        </Card>
      ) : due.due_cents === 0 && lines.length === 0 ? (
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() =>
            persist([
              { key: crypto.randomUUID(), method_id: methods[0]?.id ?? '', amount: '', gross: '', reference: '' },
            ])
          }
        >
          Registar divergência de cobrança
        </Button>
      ) : (
        <div className="space-y-2">
          {lines.map((l, i) => {
            const method = methods.find((m) => m.id === l.method_id);
            const grossCents = parsed[i]?.grossCents ?? null;
            const netCents = parsed[i]?.cents ?? null;
            return (
              <Card key={l.key}>
                <CardContent className="space-y-2 p-3">
                  <div className="flex gap-2">
                    <Select
                      value={l.method_id}
                      onValueChange={(v) =>
                        persist(lines.map((x, j) => (j === i ? { ...x, method_id: v } : x)))
                      }
                      disabled={disabled}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Forma" />
                      </SelectTrigger>
                      <SelectContent>
                        {methods.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      inputMode="decimal"
                      className="w-28"
                      placeholder="0,00"
                      value={l.amount}
                      disabled={disabled}
                      onChange={(e) =>
                        persist(lines.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remover linha"
                      disabled={disabled}
                      onClick={() => persist(lines.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {method?.kind === 'cash' && (
                    <div className="grid grid-cols-3 items-end gap-2">
                      <div>
                        <Label className="text-[11px]">Recebeu (bruto)</Label>
                        <Input
                          inputMode="decimal"
                          placeholder="0,00"
                          value={l.gross}
                          disabled={disabled}
                          onChange={(e) =>
                            persist(lines.map((x, j) => (j === i ? { ...x, gross: e.target.value } : x)))
                          }
                        />
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Troco:{' '}
                        {grossCents !== null && netCents !== null
                          ? formatCents(Math.max(grossCents - netCents, 0))
                          : '—'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Fica consigo: {netCents !== null ? formatCents(netCents) : '—'}
                      </div>
                    </div>
                  )}

                  {method?.requires_reference && (
                    <Input
                      placeholder="Referência / comprovativo"
                      value={l.reference}
                      disabled={disabled}
                      onChange={(e) =>
                        persist(lines.map((x, j) => (j === i ? { ...x, reference: e.target.value } : x)))
                      }
                    />
                  )}
                </CardContent>
              </Card>
            );
          })}

          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() =>
              persist([
                ...lines,
                {
                  key: crypto.randomUUID(),
                  method_id: methods[0]?.id ?? '',
                  amount: '',
                  gross: '',
                  reference: '',
                },
              ])
            }
          >
            <Plus className="mr-1 h-4 w-4" /> Adicionar forma de pagamento
          </Button>

          <div className="rounded-lg border p-3 text-sm">
            <div className="flex justify-between">
              <span>Total declarado</span>
              <strong>{formatCents(total)}</strong>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Diferença face ao previsto</span>
              <span className={difference === 0 ? '' : 'text-warning'}>{formatCents(difference)}</span>
            </div>
          </div>

          {difference !== 0 && (
            <div>
              <Label className="text-xs">Motivo da diferença</Label>
              <Textarea
                rows={2}
                value={reason}
                disabled={disabled}
                onChange={(e) => persist(lines, e.target.value)}
                placeholder="Explique porque recebeu a mais ou a menos"
              />
            </div>
          )}

          <Button
            className="w-full"
            disabled={disabled || declare.isPending || invalid}
            onClick={async () => {
              if (invalid) {
                toast.error('Há valores mal escritos');
                return;
              }
              const payload: PaymentLineInput[] = parsed
                .filter((l) => (l.cents ?? 0) > 0)
                .map((l) => ({
                  method_id: l.method_id,
                  amount_cents: l.cents!,
                  gross_cents: l.grossCents,
                  change_cents:
                    l.grossCents !== null && l.cents !== null
                      ? Math.max(l.grossCents - l.cents, 0)
                      : 0,
                  reference: l.reference || null,
                }));
              try {
                await declare.mutateAsync({
                  attemptId,
                  lines: payload,
                  differenceReason: reason || null,
                  opKey,
                });
                localStorage.removeItem(storageKey(attemptId));
                toast.success('Recebimento guardado');
              } catch {
                /* o rascunho fica no aparelho para reenvio */
              }
            }}
          >
            {declare.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar recebimento
          </Button>
        </div>
      )}
    </div>
  );
}
