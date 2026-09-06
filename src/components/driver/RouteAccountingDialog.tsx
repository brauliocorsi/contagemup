import { useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import {
  useMyRouteClosure,
  usePaymentMethods,
  useRoutePayments,
  useSubmitRouteAccounting,
} from '@/hooks/useDeliveryFinance';
import { centsToInput, formatCents, parseEurosToCents } from '@/lib/finance/money';
import { listDrafts } from '@/lib/finance/paymentDrafts';
import type { DeliveryAttempt } from '@/hooks/useDeliveryAttempts';

interface Props {
  routeId: string;
  routeName: string;
  attempts: DeliveryAttempt[];
}

/**
 * Prestação de contas por rota: o entregador declara o numerário que vai no
 * envelope para o cofre. Os restantes meios são conferidos electronicamente
 * pelo financeiro — não entram no envelope.
 */
export function RouteAccountingDialog({ routeId, routeName, attempts }: Props) {
  const { user } = useAuth();
  const { data: payments = [] } = useRoutePayments(routeId);
  const { data: methods = [] } = usePaymentMethods();
  const { data: closure } = useMyRouteClosure(routeId, user?.id);
  const submit = useSubmitRouteAccounting();

  const mine = useMemo(
    () => payments.filter((p) => p.declared_by === user?.id),
    [payments, user?.id],
  );
  const byMethod = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of mine) m.set(p.method_id, (m.get(p.method_id) ?? 0) + p.amount_cents);
    return m;
  }, [mine]);
  const cashCents = useMemo(
    () =>
      mine
        .filter((p) => methods.find((m) => m.id === p.method_id)?.kind === 'cash')
        .reduce((s, p) => s + p.amount_cents, 0),
    [mine, methods],
  );

  // recebimentos escritos no aparelho mas ainda não guardados no servidor
  const [open, setOpen] = useState(false);
  const pendingDrafts = useMemo(
    () => (user?.id && open ? listDrafts(user.id, routeId) : []),
    [user?.id, routeId, open],
  );

  const pendingAttempts = attempts.filter(
    (a) => a.route_id === routeId && (a.status === 'assigned' || a.status === 'in_transit'),
  );

  const [cash, setCash] = useState('');
  const [noCash, setNoCash] = useState(false);
  const [notes, setNotes] = useState('');
  const [opKey] = useState(() => crypto.randomUUID());

  if (closure) {
    return (
      <div className="rounded-lg border bg-muted/40 p-3 text-sm">
        <div className="flex items-center gap-2 font-medium">
          <Wallet className="h-4 w-4 text-primary" /> Contas fechadas
        </div>
        <p className="text-xs text-muted-foreground">
          Envelope <strong>{closure.envelope_code}</strong> •{' '}
          {closure.no_cash ? 'sem numerário' : formatCents(closure.cash_declared_cents)} • estado:{' '}
          {closure.status === 'resolved' ? 'conferido' : 'à espera do financeiro'}
        </p>
      </div>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) setCash(centsToInput(cashCents));
      }}
    >
      <DialogTrigger asChild>
        <Button className="w-full" variant="secondary">
          <Wallet className="mr-2 h-4 w-4" /> Fechar prestação de contas
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Contas da rota {routeName}</DialogTitle>
          <DialogDescription>
            Só o numerário vai no envelope para o cofre. Multibanco e transferências são conferidos
            à parte pelo financeiro.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="rounded-lg border p-3">
            {[...byMethod.entries()].length === 0 ? (
              <p className="text-muted-foreground">Não declarou recebimentos nesta rota.</p>
            ) : (
              [...byMethod.entries()].map(([id, cents]) => (
                <div key={id} className="flex justify-between">
                  <span>{methods.find((m) => m.id === id)?.label ?? id}</span>
                  <strong>{formatCents(cents)}</strong>
                </div>
              ))
            )}
            <div className="mt-2 flex justify-between border-t pt-2">
              <span>Numerário para o envelope</span>
              <strong>{formatCents(cashCents)}</strong>
            </div>
          </div>

          {pendingDrafts.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-xs">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <span>
                Tem {pendingDrafts.length} recebimento(s) escritos neste aparelho que ainda não
                foram guardados no servidor
                {pendingDrafts.some((d) => d.orderNumber)
                  ? ` (${pendingDrafts.map((d) => d.orderNumber ?? '—').join(', ')})`
                  : ''}
                . Guarde-os antes de fechar as contas.
              </span>
            </div>
          )}

          {pendingAttempts.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-warning/50 bg-warning/10 p-3 text-xs">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <span>
                {pendingAttempts.length} entrega(s) por concluir ficam registadas como excepção
                nesta prestação de contas.
              </span>
            </div>
          )}

          <label className="flex items-center gap-2">
            <Checkbox checked={noCash} onCheckedChange={(v) => setNoCash(v === true)} />
            <span>Sem numerário a depositar</span>
          </label>

          {!noCash && (
            <div>
              <Label className="text-xs">Numerário no envelope</Label>
              <Input inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} />
            </div>
          )}

          <div>
            <Label className="text-xs">Observações (opcional)</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <Badge variant="outline">
            Depois de fechar já não pode alterar os valores desta rota
          </Badge>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Voltar
          </Button>
          <Button
            disabled={submit.isPending || pendingDrafts.length > 0}
            onClick={async () => {
              if (pendingDrafts.length > 0) {
                toast.error('Há recebimentos por guardar neste aparelho');
                return;
              }
              const cents = noCash ? 0 : parseEurosToCents(cash);
              if (cents === null) {
                toast.error('Valor do envelope mal escrito');
                return;
              }
              try {
                await submit.mutateAsync({
                  routeId,
                  cashCents: cents,
                  noCash,
                  notes: notes || null,
                  opKey,
                });
                setOpen(false);
              } catch {
                /* mensagem já apresentada */
              }
            }}
          >
            {submit.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Fechar contas e declarar envelope
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
