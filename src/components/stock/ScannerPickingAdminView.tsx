import { useState } from 'react';
import {
  ClipboardList,
  Loader2,
  Trash2,
  RotateCcw,
  Ban,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import {
  useAllPickingTasks,
  usePickingTaskItems,
  useClosePickingTask,
  useReopenPickingTask,
  useDeletePickingTask,
  type PickingTaskWithTotals,
} from '@/hooks/useScannerPickingTasks';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendente',
  in_progress: 'Em curso',
  completed: 'Concluída',
  cancelled: 'Cancelada',
};

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  pending: 'secondary',
  in_progress: 'default',
  completed: 'outline',
  cancelled: 'destructive',
};

function fmt(d: string | null | undefined) {
  return d ? new Date(d).toLocaleString('pt-PT') : '—';
}

function TaskItems({ taskId }: { taskId: string }) {
  const { data: items = [], isLoading } = usePickingTaskItems(taskId);
  const { nameOf } = useProfiles();

  if (isLoading) {
    return (
      <div className="p-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (items.length === 0) {
    return <p className="p-4 text-xs text-muted-foreground">Sem artigos nesta tarefa.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-md border bg-muted/30">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Produto</TableHead>
            <TableHead>Código</TableHead>
            <TableHead className="text-right">Pedido</TableHead>
            <TableHead className="text-right">Conferido</TableHead>
            <TableHead>Conferido por</TableHead>
            <TableHead>Quando</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((it) => (
            <TableRow key={it.id}>
              <TableCell className="max-w-[280px] truncate">{it.product_name}</TableCell>
              <TableCell className="font-mono text-xs">{it.product_code || '—'}</TableCell>
              <TableCell className="text-right">{it.requested_quantity}</TableCell>
              <TableCell className="text-right font-medium">
                {it.picked_quantity}
              </TableCell>
              <TableCell className="text-xs">{it.picked_at ? nameOf(it.picked_by) : '—'}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{fmt(it.picked_at)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function ScannerPickingAdminView() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [status, setStatus] = useState('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<PickingTaskWithTotals | null>(null);

  const { data: tasks = [], isLoading } = useAllPickingTasks(status);
  const { nameOf } = useProfiles();
  const closeTask = useClosePickingTask();
  const reopenTask = useReopenPickingTask();
  const deleteTask = useDeletePickingTask();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Picking Scanner"
        description="Histórico e gestão das listas de picking enviadas para o leitor de códigos"
        icon={<ClipboardList className="h-5 w-5" />}
      />

      <Tabs value={status} onValueChange={setStatus}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="all">Todas</TabsTrigger>
          <TabsTrigger value="pending">Pendentes</TabsTrigger>
          <TabsTrigger value="in_progress">Em curso</TabsTrigger>
          <TabsTrigger value="completed">Concluídas</TabsTrigger>
          <TabsTrigger value="cancelled">Canceladas</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {tasks.length} tarefa(s)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : tasks.length === 0 ? (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              Sem tarefas de picking neste estado.
            </p>
          ) : (
            tasks.map((t) => {
              const pct = t.requested_units
                ? Math.round((t.picked_units / t.requested_units) * 100)
                : 0;
              const open = expanded === t.id;
              return (
                <div key={t.id} className="rounded-lg border">
                  <div className="flex flex-wrap items-start gap-3 p-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => setExpanded(open ? null : t.id)}
                      aria-label="Ver artigos"
                    >
                      {open ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>

                    <div className="min-w-[220px] flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{t.name}</p>
                        <Badge variant={STATUS_VARIANT[t.status]}>{STATUS_LABEL[t.status]}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t.reference ? `Ref: ${t.reference} • ` : ''}
                        Criada por {nameOf(t.created_by)} em {fmt(t.created_at)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Início: {fmt(t.started_at)} • Conclusão: {fmt(t.completed_at)}
                        {t.cancelled_at ? ` • Cancelada: ${fmt(t.cancelled_at)}` : ''}
                      </p>
                    </div>

                    <div className="w-40 space-y-1">
                      <div className="flex justify-between text-[11px] text-muted-foreground">
                        <span>
                          {t.items_done}/{t.items_count} artigos
                        </span>
                        <span>
                          {t.picked_units}/{t.requested_units} un.
                        </span>
                      </div>
                      <Progress value={pct} />
                    </div>

                    <div className="flex gap-1">
                      {(t.status === 'pending' || t.status === 'in_progress') && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!isAdmin || closeTask.isPending}
                          onClick={() => closeTask.mutate({ taskId: t.id, status: 'cancelled' })}
                        >
                          <Ban className="mr-1 h-3.5 w-3.5" />
                          Cancelar
                        </Button>
                      )}
                      {(t.status === 'completed' || t.status === 'cancelled') && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!isAdmin || reopenTask.isPending}
                          onClick={() => reopenTask.mutate(t.id)}
                        >
                          <RotateCcw className="mr-1 h-3.5 w-3.5" />
                          Reabrir
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        disabled={!isAdmin}
                        onClick={() => setToDelete(t)}
                        aria-label="Eliminar tarefa"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {open && (
                    <div className="p-3 pt-0">
                      <TaskItems taskId={t.id} />
                    </div>
                  )}
                </div>
              );
            })
          )}
          {!isAdmin && (
            <p className="text-xs text-muted-foreground">
              Apenas administradores podem cancelar, reabrir ou eliminar tarefas.
            </p>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar tarefa de picking?</AlertDialogTitle>
            <AlertDialogDescription>
              A tarefa "{toDelete?.name}" e todos os seus artigos serão removidos. As saídas de
              stock já registadas não são afetadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (toDelete) deleteTask.mutate(toDelete.id);
                setToDelete(null);
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
