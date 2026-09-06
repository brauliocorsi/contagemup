import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  CalendarClock,
  CheckCircle2,
  Loader2,
  Package,
  Truck,
  Undo2,
  UserPlus,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/hooks/useAuth';
import { useProfiles } from '@/hooks/useProfiles';
import { useAssignmentConflicts } from '@/hooks/useRoutes';
import {
  DELIVERY_STATUS_LABELS,
  useDeliveryNoteItems,
  useDeliveryNotes,
  type DeliveryNote,
} from '@/hooks/useDeliveryNotes';
import {
  ATTEMPT_STATUS_LABELS,
  FAILURE_REASON_LABELS,
  OUTCOME_LABELS,
  pendingReturn,
  useAttemptLines,
  useCancelNote,
  useDeliveryAttempts,
  useDeliveryEvents,
  useRescheduleNote,
  type DeliveryAttempt,
} from '@/hooks/useDeliveryAttempts';
import { AssignDeliveryDialog } from './AssignDeliveryDialog';
import { ReturnReceiptDialog } from './ReturnReceiptDialog';

function fmt(v: string | null) {
  return v ? new Date(v).toLocaleString('pt-PT') : '—';
}
function fmtDay(v: string | null) {
  return v ? new Date(v + 'T00:00:00').toLocaleDateString('pt-PT') : '—';
}

const EVENT_LABELS: Record<string, string> = {
  tentativa_atribuida: 'Entrega atribuída',
  tentativa_iniciada: 'Entregador a caminho',
  entrega_confirmada: 'Entrega confirmada',
  retorno_recebido: 'Retorno conferido',
  reagendada: 'Reagendada',
  encomenda_cancelada: 'Encomenda cancelada',
};

/** Detalhe de uma tentativa: pedido, carregado, entregue, retorno e saldo. */
function AttemptDetail({ attempt }: { attempt: DeliveryAttempt }) {
  const { data: lines = [], isLoading } = useAttemptLines(attempt.id);
  const { data: events = [] } = useDeliveryEvents(attempt.note_id);
  const { nameOf } = useProfiles();

  if (isLoading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-4">
        <span>Viatura: {attempt.vehicle_location || '—'}</span>
        <span>Entregador: {nameOf(attempt.driver_id)}</span>
        <span>Prevista: {fmtDay(attempt.scheduled_date)}</span>
        <span>Fechada: {fmt(attempt.completed_at)}</span>
      </div>
      {attempt.partial_load && (
        <p className="rounded-md border border-warning/50 bg-warning-soft p-2 text-xs">
          Carga incompleta à saída do armazém
          {attempt.partial_load_reason ? `: ${attempt.partial_load_reason}` : ''}.
        </p>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Artigo</TableHead>
            <TableHead className="text-center">Caixa</TableHead>
            <TableHead className="text-center">Pedido</TableHead>
            <TableHead className="text-center">Carregado</TableHead>
            <TableHead className="text-center">Entregue</TableHead>
            <TableHead className="text-center">Retorno esperado</TableHead>
            <TableHead className="text-center">Recebido</TableHead>
            <TableHead>Motivo / exceção</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((l) => (
            <TableRow key={l.id}>
              <TableCell className="text-xs">
                <span className="font-mono">{l.product_code}</span> {l.product_name}
              </TableCell>
              <TableCell className="text-center text-xs">{l.colis_number}</TableCell>
              <TableCell className="text-center text-xs">{l.ordered_quantity}</TableCell>
              <TableCell className="text-center text-xs">{l.loaded_quantity}</TableCell>
              <TableCell className="text-center text-xs">{l.delivered_quantity}</TableCell>
              <TableCell className="text-center text-xs">{pendingReturn(l)}</TableCell>
              <TableCell className="text-center text-xs">
                {l.return_received_ok} bom / {l.return_received_damaged} avariado
              </TableCell>
              <TableCell className="text-xs">
                {[l.undelivered_reason ? FAILURE_REASON_LABELS[l.undelivered_reason] ?? l.undelivered_reason : null,
                  l.exception_note]
                  .filter(Boolean)
                  .join(' • ') || '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div>
        <p className="mb-1 text-xs font-semibold">Linha temporal</p>
        <ul className="space-y-1 text-xs text-muted-foreground">
          {events.map((e) => (
            <li key={e.id}>
              {fmt(e.created_at)} — {EVENT_LABELS[e.event_type] ?? e.event_type} · {nameOf(e.actor)}
            </li>
          ))}
          {events.length === 0 && <li>Sem eventos.</li>}
        </ul>
      </div>
    </div>
  );
}

export function DeliveriesView() {
  const { profile } = useAuth();
  const isManager = profile?.role === 'admin' || profile?.role === 'operator';
  const { profiles, nameOf } = useProfiles();

  const [status, setStatus] = useState<'all' | 'assigned' | 'in_transit' | 'completed' | 'cancelled'>('all');
  const [driverId, setDriverId] = useState<string>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [assignNotes, setAssignNotes] = useState<string[] | null>(null);
  const [returnAttempt, setReturnAttempt] = useState<DeliveryAttempt | null>(null);
  const [rescheduleNote, setRescheduleNoteState] = useState<DeliveryNote | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rescheduleDriver, setRescheduleDriver] = useState('');
  const [cancelNoteTarget, setCancelNoteTarget] = useState<DeliveryNote | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const { data: attempts = [], isLoading } = useDeliveryAttempts({
    status,
    driverId: driverId === 'all' ? null : driverId,
    from: from || null,
    to: to || null,
    search,
  });
  const { data: notes = [] } = useDeliveryNotes('all');
  const reschedule = useRescheduleNote();
  const cancel = useCancelNote();

  const openNoteIds = useMemo(
    () =>
      new Set(
        attempts.filter((a) => a.status === 'assigned' || a.status === 'in_transit').map((a) => a.note_id),
      ),
    [attempts],
  );

  const toAssign = useMemo(
    () =>
      notes.filter(
        (n) =>
          !openNoteIds.has(n.id) &&
          !['delivered', 'cancelled'].includes(n.status as string) &&
          (n.status === 'staged' || n.status === 'loaded' || n.status === 'partial' || n.status === 'not_delivered'),
      ),
    [notes, openNoteIds],
  );

  const returnsPending = useMemo(
    () => attempts.filter((a) => a.status === 'completed' && a.outcome !== 'delivered_full'),
    [attempts],
  );

  const flagged = useMemo(
    () => notes.filter((n) => n.cancellation_requested || n.reschedule_requested),
    [notes],
  );

  const { data: conflicts = [] } = useAssignmentConflicts();

  const drivers = useMemo(() => profiles.filter((p) => p.role === 'entregador' || p.role === 'operator'), [profiles]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Entregas"
        description="Tentativas por rota e cliente, resultado no cliente, retornos a conferir e saldos por encomenda."
      />

      {conflicts.length > 0 && (
        <div className="rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm">
          <p className="font-medium">
            {conflicts.length} entrega(s) com atribuição antiga por decidir
          </p>
          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            {conflicts.slice(0, 8).map((c) => (
              <li key={c.attempt_id}>
                {c.order_number} — {c.client_name || 'Sem cliente'}: atribuída a{' '}
                {nameOf(c.legacy_driver_id)}{' '}
                {c.conflict_type === 'sem_rota'
                  ? '(sem rota associada)'
                  : c.conflict_type === 'rota_sem_entregador'
                    ? `(rota ${c.route_name} sem entregador)`
                    : `(rota ${c.route_name} está com ${nameOf(c.route_driver_id)})`}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted-foreground">
            Defina o entregador na rota para regularizar. Nada foi alterado automaticamente.
          </p>
        </div>
      )}

      <Tabs defaultValue="tentativas">

        <TabsList className="flex-wrap">
          <TabsTrigger value="tentativas">Tentativas</TabsTrigger>
          <TabsTrigger value="atribuir">Por atribuir ({toAssign.length})</TabsTrigger>
          <TabsTrigger value="retornos">Retornos ({returnsPending.length})</TabsTrigger>
          <TabsTrigger value="ocorrencias">Ocorrências ({flagged.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="tentativas" className="space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Truck className="h-4 w-4" /> Tentativas de entrega
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-5">
                <Input
                  placeholder="Encomenda ou cliente"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os estados</SelectItem>
                    {(Object.keys(ATTEMPT_STATUS_LABELS) as (keyof typeof ATTEMPT_STATUS_LABELS)[]).map((s) => (
                      <SelectItem key={s} value={s}>
                        {ATTEMPT_STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={driverId} onValueChange={setDriverId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os entregadores</SelectItem>
                    {drivers.map((d) => (
                      <SelectItem key={d.user_id} value={d.user_id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>

              {isLoading ? (
                <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
              ) : attempts.length === 0 ? (
                <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Nenhuma tentativa com estes filtros.
                </p>
              ) : (
                <div className="space-y-2">
                  {attempts.map((a) => (
                    <div key={a.id} className="space-y-2 rounded-lg border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          className="min-w-0 flex-1 text-left"
                          onClick={() => setExpanded(expanded === a.id ? null : a.id)}
                        >
                          <p className="truncate font-medium">
                            {a.order_number}
                            <span className="ml-2 text-xs text-muted-foreground">
                              tentativa {a.attempt_number}
                            </span>
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {a.client_name || 'Sem cliente'} • {nameOf(a.driver_id)} •{' '}
                            {fmtDay(a.scheduled_date)}
                          </p>
                        </button>
                        {a.partial_load && (
                          <Badge variant="outline" className="border-warning/50 text-warning">
                            Carga parcial
                          </Badge>
                        )}
                        <Badge variant={a.status === 'completed' ? 'outline' : 'default'}>
                          {ATTEMPT_STATUS_LABELS[a.status]}
                        </Badge>
                        {a.outcome && <Badge variant="secondary">{OUTCOME_LABELS[a.outcome]}</Badge>}
                        {a.failure_reason && (
                          <Badge variant="outline">
                            {FAILURE_REASON_LABELS[a.failure_reason] ?? a.failure_reason}
                          </Badge>
                        )}
                      </div>
                      {expanded === a.id && <AttemptDetail attempt={a} />}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="atribuir">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Package className="h-4 w-4" /> Encomendas sem entrega marcada
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {toAssign.length === 0 ? (
                <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Nada por atribuir.
                </p>
              ) : (
                toAssign.map((n) => (
                  <div key={n.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{n.order_number}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {n.client_name || 'Sem cliente'} • {DELIVERY_STATUS_LABELS[n.status] ?? n.status}
                        {n.vehicle_location ? ` • ${n.vehicle_location}` : ''}
                      </p>
                    </div>
                    {isManager && (
                      <Button size="sm" onClick={() => setAssignNotes([n.id])}>
                        <UserPlus className="mr-1 h-4 w-4" /> Atribuir
                      </Button>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="retornos">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Undo2 className="h-4 w-4" /> Retornos por conferir
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {returnsPending.length === 0 ? (
                <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Sem retornos pendentes.
                </p>
              ) : (
                returnsPending.map((a) => (
                  <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{a.order_number}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {a.client_name || 'Sem cliente'} • {a.vehicle_location || 'viatura'} •{' '}
                        {a.outcome ? OUTCOME_LABELS[a.outcome] : ''}
                      </p>
                    </div>
                    {isManager && (
                      <Button size="sm" variant="outline" onClick={() => setReturnAttempt(a)}>
                        <Undo2 className="mr-1 h-4 w-4" /> Conferir retorno
                      </Button>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ocorrencias">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4" /> Pedidos do cliente por validar
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {flagged.length === 0 ? (
                <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Nada por validar.
                </p>
              ) : (
                flagged.map((n) => (
                  <div key={n.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{n.order_number}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {n.client_name || 'Sem cliente'} •{' '}
                        {n.cancellation_requested ? 'Cliente pediu cancelamento' : 'Cliente pediu nova data'}
                        {n.cancellation_reason ? ` — ${n.cancellation_reason}` : ''}
                      </p>
                    </div>
                    {isManager && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setRescheduleNoteState(n);
                            setRescheduleDriver('');
                          }}
                        >
                          <CalendarClock className="mr-1 h-4 w-4" /> Agendar restante
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            setCancelNoteTarget(n);
                            setCancelReason(n.cancellation_reason ?? '');
                          }}
                        >
                          <Ban className="mr-1 h-4 w-4" /> Validar cancelamento
                        </Button>
                      </>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AssignDeliveryDialog
        open={!!assignNotes}
        onOpenChange={(o) => !o && setAssignNotes(null)}
        noteIds={assignNotes ?? []}
      />
      <ReturnReceiptDialog attempt={returnAttempt} onOpenChange={(o) => !o && setReturnAttempt(null)} />

      <AlertDialog open={!!rescheduleNote} onOpenChange={(o) => !o && setRescheduleNoteState(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Agendar o que falta — {rescheduleNote?.order_number}</AlertDialogTitle>
            <AlertDialogDescription>
              Cria uma nova tentativa apenas para o saldo em falta. O histórico da tentativa anterior
              mantém-se como está.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nova data</Label>
              <Input
                type="date"
                className="mt-1"
                value={rescheduleDate}
                onChange={(e) => setRescheduleDate(e.target.value)}
              />
            </div>
            <div>
              <Label>Entregador (opcional)</Label>
              <Select value={rescheduleDriver} onValueChange={setRescheduleDriver}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Definir mais tarde" />
                </SelectTrigger>
                <SelectContent>
                  {drivers.map((d) => (
                    <SelectItem key={d.user_id} value={d.user_id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={reschedule.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (!rescheduleNote) return;
                void reschedule
                  .mutateAsync({
                    noteId: rescheduleNote.id,
                    date: rescheduleDate,
                    driverId: rescheduleDriver || null,
                  })
                  .then(() => setRescheduleNoteState(null));
              }}
            >
              <CheckCircle2 className="mr-1 h-4 w-4" /> Criar tentativa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!cancelNoteTarget} onOpenChange={(o) => !o && setCancelNoteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar {cancelNoteTarget?.order_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              A encomenda deixa de poder ser agendada. A mercadoria só fica disponível depois de
              recebida e conferida como apta; o que estiver avariado fica em quarentena. Nada é
              alterado no sistema comercial externo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Motivo do cancelamento"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={cancel.isPending || cancelReason.trim().length < 3}
              onClick={(e) => {
                e.preventDefault();
                if (!cancelNoteTarget) return;
                void cancel
                  .mutateAsync({ noteId: cancelNoteTarget.id, reason: cancelReason })
                  .then(() => setCancelNoteTarget(null));
              }}
            >
              Cancelar encomenda
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
