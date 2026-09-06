import { useMemo, useState } from 'react';
import { AlertTriangle, BadgeEuro, CheckCircle2, Loader2, Send, Wallet } from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/layout/PageHeader';
import { PageContainer } from '@/components/layout/PageContainer';
import {
  useCashClosures,
  useClosureChecks,
  useConfirmMethodCheck,
  useCountEnvelope,
  usePaymentMethods,
  useResolveClosure,
  type RouteCashClosure,
} from '@/hooks/useDeliveryFinance';
import { useProfiles } from '@/hooks/useProfiles';
import { useRoutes } from '@/hooks/useRoutes';
import { useDispatchIncidents, useIncidents, DISPATCH_LABELS } from '@/hooks/useAssistance';
import { formatCents, parseEurosToCents } from '@/lib/finance/money';
import { toast } from 'sonner';

const STATUS_LABELS: Record<RouteCashClosure['status'], string> = {
  submitted: 'Por conferir',
  counting: 'Em conferência',
  resolved: 'Conferido',
};

function ClosureCard({ closure }: { closure: RouteCashClosure }) {
  const { data: checks = [] } = useClosureChecks(closure.id);
  const { data: methods = [] } = usePaymentMethods();
  const { data: routes = [] } = useRoutes();
  const { nameOf } = useProfiles();
  const count = useCountEnvelope();
  const confirm = useConfirmMethodCheck();
  const resolve = useResolveClosure();

  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [checkValues, setCheckValues] = useState<Record<string, { value: string; ref: string }>>({});

  const route = routes.find((r) => r.id === closure.route_id);
  const driverName = nameOf(closure.driver_id);

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Wallet className="h-4 w-4 text-primary" />
          <span className="font-semibold">{route?.name ?? 'Rota'}</span>
          <Badge variant="outline">{closure.envelope_code}</Badge>
          <Badge>{STATUS_LABELS[closure.status]}</Badge>
          <span className="text-xs text-muted-foreground">
            {route?.scheduled_date} • custódia: {driverName} •{' '}
            {new Date(closure.submitted_at).toLocaleString('pt-PT')}
          </span>
        </div>

        <div className="grid gap-2 sm:grid-cols-3 text-sm">
          <div className="rounded-lg border p-2">
            <p className="text-xs text-muted-foreground">Previsto da rota</p>
            <strong>{formatCents(closure.expected_cents)}</strong>
          </div>
          <div className="rounded-lg border p-2">
            <p className="text-xs text-muted-foreground">Declarado pelo entregador</p>
            <strong>{formatCents(closure.declared_cents)}</strong>
          </div>
          <div className="rounded-lg border p-2">
            <p className="text-xs text-muted-foreground">Envelope de numerário</p>
            <strong>{closure.no_cash ? 'Sem numerário' : formatCents(closure.cash_declared_cents)}</strong>
          </div>
        </div>

        {closure.exceptions?.length > 0 && (
          <div className="rounded-lg border border-warning/50 bg-warning/10 p-2 text-xs">
            <AlertTriangle className="mr-1 inline h-3 w-3 text-warning" />
            {closure.exceptions.length} entrega(s) por concluir nesta rota.
          </div>
        )}

        {!closure.no_cash && closure.cash_declared_cents > 0 && (
          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-sm font-medium">Abertura do envelope</p>
            {closure.counted_at ? (
              <p className="text-xs text-muted-foreground">
                Contado {formatCents(closure.counted_cents)} em{' '}
                {new Date(closure.counted_at).toLocaleString('pt-PT')} — diferença{' '}
                <strong>{formatCents(closure.difference_cents ?? 0)}</strong> (a declaração original
                mantém-se {formatCents(closure.cash_declared_cents)}).
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <div>
                  <Label className="text-[11px]">Valor contado</Label>
                  <Input
                    inputMode="decimal"
                    className="w-32"
                    value={counted}
                    onChange={(e) => setCounted(e.target.value)}
                  />
                </div>
                <div className="flex-1">
                  <Label className="text-[11px]">Nota</Label>
                  <Input value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
                <Button
                  className="self-end"
                  disabled={count.isPending}
                  onClick={() => {
                    const cents = parseEurosToCents(counted);
                    if (cents === null) return toast.error('Valor mal escrito');
                    count.mutate({ closureId: closure.id, countedCents: cents, note });
                  }}
                >
                  Registar contagem
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="space-y-2 rounded-lg border p-3">
          <p className="text-sm font-medium">Conferência por meio de pagamento</p>
          {checks.length === 0 && (
            <p className="text-xs text-muted-foreground">Sem recebimentos declarados nesta rota.</p>
          )}
          {checks.map((c) => {
            const label = methods.find((m) => m.id === c.method_id)?.label ?? c.method_id;
            const v = checkValues[c.id] ?? { value: '', ref: '' };
            return (
              <div key={c.id} className="flex flex-wrap items-end gap-2 text-sm">
                <span className="w-40">
                  {label}: <strong>{formatCents(c.declared_cents)}</strong>
                </span>
                {c.status === 'pending' ? (
                  <>
                    <Input
                      inputMode="decimal"
                      placeholder="Confirmado"
                      className="w-28"
                      value={v.value}
                      onChange={(e) =>
                        setCheckValues((s) => ({ ...s, [c.id]: { ...v, value: e.target.value } }))
                      }
                    />
                    <Input
                      placeholder="Referência"
                      className="w-40"
                      value={v.ref}
                      onChange={(e) =>
                        setCheckValues((s) => ({ ...s, [c.id]: { ...v, ref: e.target.value } }))
                      }
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={confirm.isPending}
                      onClick={() => {
                        const cents = parseEurosToCents(v.value);
                        if (cents === null) return toast.error('Valor mal escrito');
                        confirm.mutate({
                          checkId: c.id,
                          confirmedCents: cents,
                          reference: v.ref,
                          note: '',
                        });
                      }}
                    >
                      Confirmar
                    </Button>
                  </>
                ) : (
                  <Badge variant={c.status === 'confirmed' ? 'default' : 'destructive'}>
                    {c.status === 'confirmed'
                      ? `Confirmado ${formatCents(c.confirmed_cents)}`
                      : `Divergente: ${formatCents(c.confirmed_cents)}`}
                    {c.reference ? ` • ${c.reference}` : ''}
                  </Badge>
                )}
              </div>
            );
          })}
          <p className="text-[11px] text-muted-foreground">
            Confirmação local. Nada foi registado na Gestão Click nesta fase.
          </p>
        </div>

        {closure.status !== 'resolved' && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1">
              <Label className="text-[11px]">Resolução / justificação da diferença</Label>
              <Textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Explique como foi resolvida a diferença"
              />
            </div>
            <Button
              disabled={resolve.isPending}
              onClick={() => resolve.mutate({ closureId: closure.id, note })}
            >
              {resolve.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Concluir conferência
            </Button>
          </div>
        )}
        {closure.status === 'resolved' && (
          <p className="flex items-center gap-1 text-xs text-success">
            <CheckCircle2 className="h-3 w-3" /> Conferido em{' '}
            {closure.resolved_at ? new Date(closure.resolved_at).toLocaleString('pt-PT') : ''}
            {closure.resolution_note ? ` — ${closure.resolution_note}` : ''}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Área do financeiro: fechos de rotas, envelopes e fila de assistências. */
export function FinanceClosuresView() {
  const [status, setStatus] = useState<'all' | 'submitted' | 'counting' | 'resolved'>('submitted');
  const { data: closures = [], isLoading } = useCashClosures({ status });
  const { data: incidents = [] } = useIncidents();
  const dispatch = useDispatchIncidents();

  const totals = useMemo(
    () => ({
      declared: closures.reduce((s, c) => s + c.declared_cents, 0),
      cash: closures.reduce((s, c) => s + c.cash_declared_cents, 0),
    }),
    [closures],
  );

  const queued = incidents.filter((i) => i.dispatch_status !== 'sent');

  return (
    <PageContainer>
      <PageHeader
        title="Fechos de rotas"
        description="Prestações de contas por rota, envelopes de numerário e conferência dos restantes meios."
      />

      <Tabs defaultValue="fechos">
        <TabsList>
          <TabsTrigger value="fechos">Fechos</TabsTrigger>
          <TabsTrigger value="assistencias">Assistências ({queued.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="fechos" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="submitted">Por conferir</SelectItem>
                <SelectItem value="counting">Em conferência</SelectItem>
                <SelectItem value="resolved">Conferidos</SelectItem>
              </SelectContent>
            </Select>
            <Badge variant="outline">
              <BadgeEuro className="mr-1 h-3 w-3" /> Declarado: {formatCents(totals.declared)}
            </Badge>
            <Badge variant="outline">Numerário: {formatCents(totals.cash)}</Badge>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : closures.length === 0 ? (
            <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              Sem prestações de contas nesta situação.
            </p>
          ) : (
            closures.map((c) => <ClosureCard key={c.id} closure={c} />)
          )}
        </TabsContent>

        <TabsContent value="assistencias" className="space-y-3">
          <Button
            variant="outline"
            disabled={dispatch.isPending || queued.length === 0}
            onClick={() => dispatch.mutate(undefined)}
          >
            <Send className="mr-2 h-4 w-4" /> Reenviar assistências em fila
          </Button>
          {incidents.map((i) => (
            <Card key={i.id}>
              <CardContent className="space-y-1 p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{i.subject}</span>
                  <Badge
                    variant={
                      i.dispatch_status === 'sent'
                        ? 'default'
                        : i.dispatch_status === 'error'
                          ? 'destructive'
                          : 'secondary'
                    }
                  >
                    {DISPATCH_LABELS[i.dispatch_status]}
                    {i.ticket_number ? ` • ${i.ticket_number}` : ''}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Encomenda {i.order_number} • {new Date(i.occurred_at).toLocaleString('pt-PT')} •{' '}
                  {i.product_lines?.length ?? 0} artigo(s)
                </p>
                <p className="text-xs">{i.description}</p>
                {i.last_error && <p className="text-xs text-destructive">{i.last_error}</p>}
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
