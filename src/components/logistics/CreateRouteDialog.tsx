import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Route as RouteIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  findActiveRouteConflicts,
  useCreateRoute,
  type RouteConflict,
} from '@/hooks/useRoutes';
import { DEFAULT_ADDRESS_FROM, PLATES, type SepOrder } from '@/lib/logistics/types';

export function CreateRouteDialog({
  open,
  onOpenChange,
  orders,
  defaultAddress,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orders: SepOrder[];
  defaultAddress: string;
  onCreated: (routeId: string) => void;
}) {
  const suggestedDate = useMemo(() => {
    const dates = orders.map((o) => o.entrega).filter(Boolean).sort();
    const raw = dates[0] ?? '';
    const dmy = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(raw);
    if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    return new Date().toISOString().slice(0, 10);
  }, [orders]);

  const [name, setName] = useState('');
  const [date, setDate] = useState(suggestedDate);
  const [address, setAddress] = useState(defaultAddress || DEFAULT_ADDRESS_FROM);
  const [plate, setPlate] = useState<string>(PLATES[0]);
  const [conflicts, setConflicts] = useState<RouteConflict[] | null>(null);
  const [checking, setChecking] = useState(false);
  const create = useCreateRoute();

  useEffect(() => {
    if (!open) return;
    setDate(suggestedDate);
    setName(`Rota ${suggestedDate}`);
    setAddress(defaultAddress || DEFAULT_ADDRESS_FROM);
    setConflicts(null);
    setChecking(true);
    findActiveRouteConflicts(orders.map((o) => o.id))
      .then(setConflicts)
      .catch(() => setConflicts([]))
      .finally(() => setChecking(false));
  }, [open, orders, suggestedDate, defaultAddress]);

  const blocked = (conflicts?.length ?? 0) > 0;

  async function handleCreate() {
    if (!name.trim()) {
      toast.error('Indique o nome da rota');
      return;
    }
    if (blocked) return;
    const routeId = await create.mutateAsync({
      name: name.trim(),
      scheduledDate: date,
      departureAddress: address,
      plate,
      stops: orders.map((o) => ({
        venda_id: o.id,
        venda_codigo: o.codigo,
        client_name: o.cliente || 'Cliente',
        address: o.morada || null,
        venda_data: o.entrega || null,
        venda_status: o.situacao || null,
      })),
    });
    onOpenChange(false);
    onCreated(routeId);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Criar rota</DialogTitle>
          <DialogDescription>
            {orders.length} nota(s) de encomenda passam a fazer parte desta rota.
          </DialogDescription>
        </DialogHeader>

        {checking && (
          <p className="text-sm text-muted-foreground">A validar notas noutras rotas…</p>
        )}

        {blocked && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
            <p className="flex items-center gap-2 font-medium text-destructive">
              <AlertTriangle className="h-4 w-4" /> Notas já em rotas ativas
            </p>
            <ul className="mt-2 space-y-1 text-muted-foreground">
              {conflicts!.map((c) => (
                <li key={`${c.route_id}-${c.venda_id}`}>
                  {c.venda_codigo || c.venda_id} · {c.route_name}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-muted-foreground">
              Retire estas notas da seleção para poder criar a rota.
            </p>
          </div>
        )}

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="rota-nome">Nome da rota</Label>
            <Input id="rota-nome" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="rota-data">Data</Label>
              <Input id="rota-data" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rota-matricula">Matrícula</Label>
              <Select value={plate} onValueChange={setPlate}>
                <SelectTrigger id="rota-matricula">
                  <SelectValue placeholder="Matrícula" />
                </SelectTrigger>
                <SelectContent>
                  {PLATES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="rota-origem">Morada de partida</Label>
            <Input id="rota-origem" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void handleCreate()} disabled={blocked || checking || create.isPending}>
            <RouteIcon className="mr-2 h-4 w-4" />
            {create.isPending ? 'A criar…' : 'Criar rota'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
