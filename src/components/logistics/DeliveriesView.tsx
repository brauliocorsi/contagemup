import { useMemo, useState } from 'react';
import { Truck, CheckCircle2, Undo2, Trash2, Loader2, Package } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import {
  DELIVERY_STATUS_LABELS,
  useDeleteDeliveryNote,
  useDeliverNote,
  useDeliveryNoteItems,
  useDeliveryNotes,
  useReturnNote,
  useTypedLocations,
  type DeliveryNote,
  type DeliveryStatus,
} from '@/hooks/useDeliveryNotes';
import { toast } from 'sonner';

const STATUS_VARIANT: Record<DeliveryStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  picking: 'outline',
  staged: 'secondary',
  loaded: 'default',
  delivered: 'outline',
  returned: 'destructive',
};

function fmt(value: string | null) {
  return value ? new Date(value).toLocaleString('pt-PT') : '—';
}

function NoteItems({ note }: { note: DeliveryNote }) {
  const { data: items = [], isLoading } = useDeliveryNoteItems([note.id]);
  if (isLoading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="mb-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-4">
        <span>Cais: {note.dock_location || '—'}</span>
        <span>Viatura: {note.vehicle_location || '—'}</span>
        <span>No cais: {fmt(note.staged_at)}</span>
        <span>Carregado: {fmt(note.loaded_at)}</span>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>Produto</TableHead>
            <TableHead className="text-center">Pedido</TableHead>
            <TableHead className="text-center">Cais</TableHead>
            <TableHead className="text-center">Carregado</TableHead>
            <TableHead className="text-center">Entregue</TableHead>
            <TableHead>Local</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((i) => (
            <TableRow key={i.id}>
              <TableCell className="font-mono text-xs">{i.product_code || '—'}</TableCell>
              <TableCell className="text-xs">{i.product_name}</TableCell>
              <TableCell className="text-center text-xs">{i.quantity}</TableCell>
              <TableCell className="text-center text-xs">{i.staged_quantity}</TableCell>
              <TableCell className="text-center text-xs">{i.loaded_quantity}</TableCell>
              <TableCell className="text-center text-xs">{i.delivered_quantity}</TableCell>
              <TableCell className="text-xs">{i.location || '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function DeliveriesView() {
  const [status, setStatus] = useState<DeliveryStatus | 'all'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [toDeliver, setToDeliver] = useState<DeliveryNote | null>(null);
  const [toReturn, setToReturn] = useState<DeliveryNote | null>(null);
  const [toDelete, setToDelete] = useState<DeliveryNote | null>(null);

  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const { data: notes = [], isLoading } = useDeliveryNotes(status);
  const { data: quarantines = [] } = useTypedLocations('quarantine');
  const deliver = useDeliverNote();
  const returnNote = useReturnNote();
  const removeNote = useDeleteDeliveryNote();

  const byVehicle = useMemo(() => {
    const map = new Map<string, DeliveryNote[]>();
    for (const n of notes) {
      const key = n.vehicle_location || 'Sem viatura';
      map.set(key, [...(map.get(key) ?? []), n]);
    }
    return [...map.entries()];
  }, [notes]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Entregas"
        description="Notas em cais, em transporte e entregues. A saída de stock só acontece ao confirmar a entrega."
      />

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Truck className="h-4 w-4" /> Notas de entrega
          </CardTitle>
          <Select value={status} onValueChange={(v) => setStatus(v as DeliveryStatus | 'all')}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os estados</SelectItem>
              {(Object.keys(DELIVERY_STATUS_LABELS) as DeliveryStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {DELIVERY_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
          ) : notes.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nenhuma nota de entrega.
            </p>
          ) : (
            byVehicle.map(([vehicle, group]) => (
              <div key={vehicle} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">{vehicle}</span>
                  <Badge variant="secondary">{group.length}</Badge>
                </div>
                {group.map((n) => (
                  <div key={n.id} className="space-y-2 rounded-lg border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        className="min-w-0 flex-1 text-left"
                        onClick={() => setExpanded(expanded === n.id ? null : n.id)}
                      >
                        <p className="truncate font-medium">{n.order_number}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {n.client_name || 'Sem cliente'} • criada {fmt(n.created_at)}
                          {n.delivered_at ? ` • entregue ${fmt(n.delivered_at)}` : ''}
                        </p>
                      </button>
                      <Badge variant={STATUS_VARIANT[n.status]}>
                        {DELIVERY_STATUS_LABELS[n.status]}
                      </Badge>
                      {n.status !== 'delivered' && n.status !== 'returned' && (
                        <Button size="sm" onClick={() => setToDeliver(n)}>
                          <CheckCircle2 className="mr-1 h-4 w-4" /> Entregue
                        </Button>
                      )}
                      {n.status !== 'returned' && (
                        <Button size="sm" variant="outline" onClick={() => setToReturn(n)}>
                          <Undo2 className="mr-1 h-4 w-4" /> Devolvido
                        </Button>
                      )}
                      {isAdmin && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive"
                          aria-label="Eliminar nota"
                          onClick={() => setToDelete(n)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    {expanded === n.id && <NoteItems note={n} />}
                  </div>
                ))}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!toDeliver} onOpenChange={(o) => !o && setToDeliver(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar entrega da nota {toDeliver?.order_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação dá a saída definitiva do stock associado à nota.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deliver.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (toDeliver)
                  void deliver.mutateAsync(toDeliver.id).then(() => setToDeliver(null));
              }}
            >
              Confirmar entrega
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!toReturn} onOpenChange={(o) => !o && setToReturn(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Registar devolução da nota {toReturn?.order_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              O stock volta para a zona de quarentena
              {quarantines[0] ? ` (${quarantines[0].code})` : ''}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={returnNote.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (!quarantines[0]) {
                  toast.error('Configure uma localização do tipo Quarentena');
                  return;
                }
                if (toReturn)
                  void returnNote
                    .mutateAsync({
                      noteId: toReturn.id,
                      quarantineLocation: quarantines[0].code,
                    })
                    .then(() => setToReturn(null));
              }}
            >
              Registar devolução
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar a nota {toDelete?.order_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              O registo é removido definitivamente. O stock já movimentado não é revertido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={removeNote.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (toDelete) void removeNote.mutateAsync(toDelete.id).then(() => setToDelete(null));
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
