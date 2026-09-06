import { useMemo, useState } from 'react';
import { Loader2, UserPlus } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useProfiles } from '@/hooks/useProfiles';
import { useAssignAttempts } from '@/hooks/useDeliveryAttempts';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  noteIds: string[];
  label?: string;
}

/** Atribui uma ou mais encomendas a um entregador, com data prevista. */
export function AssignDeliveryDialog({ open, onOpenChange, noteIds, label }: Props) {
  const { profiles } = useProfiles();
  const assign = useAssignAttempts();
  const [driver, setDriver] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const drivers = useMemo(
    () => profiles.filter((p) => p.role === 'entregador' || p.role === 'operator'),
    [profiles],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Atribuir entrega</DialogTitle>
          <DialogDescription>
            {label ?? `${noteIds.length} encomenda(s)`} — o entregador passa a ver apenas estas entregas.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Entregador</Label>
            <Select value={driver} onValueChange={setDriver}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Escolher entregador" />
              </SelectTrigger>
              <SelectContent>
                {drivers.map((p) => (
                  <SelectItem key={p.user_id} value={p.user_id}>
                    {p.name} {p.role === 'operator' ? '(operador)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {drivers.length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Ainda não há utilizadores com perfil de entregador. Defina o perfil em Configurações.
              </p>
            )}
          </div>
          <div>
            <Label>Data prevista</Label>
            <Input type="date" className="mt-1" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!driver || assign.isPending || noteIds.length === 0}
            onClick={() =>
              void assign
                .mutateAsync({ noteIds, driverId: driver, date: date || null })
                .then(() => onOpenChange(false))
            }
          >
            {assign.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="mr-1 h-4 w-4" />
            )}
            Atribuir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
