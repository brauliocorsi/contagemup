import { useEffect, useMemo, useState } from 'react';
import { Loader2, UserPlus, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useProfiles } from '@/hooks/useProfiles';
import { useAssignRouteDriver } from '@/hooks/useRoutes';
import { useDeliveryAttempts } from '@/hooks/useDeliveryAttempts';

const NONE = 'sem-entregador';

/**
 * Atribuição do entregador à rota concreta: uma só ação cobre todas as
 * entregas da rota, incluindo as que forem acrescentadas depois.
 */
export function RouteDriverCard({
  routeId,
  driverId,
  driverAssignedAt,
  driverAssignedBy,
}: {
  routeId: string;
  driverId: string | null;
  driverAssignedAt: string | null;
  driverAssignedBy: string | null;
}) {
  const { profiles, nameOf } = useProfiles();
  const assign = useAssignRouteDriver();
  const { data: attempts = [] } = useDeliveryAttempts({ routeId });
  const [value, setValue] = useState(driverId ?? NONE);
  const [reason, setReason] = useState('');

  useEffect(() => setValue(driverId ?? NONE), [driverId]);

  const drivers = useMemo(
    () => profiles.filter((p) => p.role === 'entregador' || p.role === 'operator'),
    [profiles],
  );

  const pending = attempts.filter((a) => a.status === 'assigned' || a.status === 'in_transit');
  const inTransit = pending.filter((a) => a.status === 'in_transit');
  const changing = (driverId ?? NONE) !== value;
  const needsReason = changing && inTransit.length > 0;

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <UserPlus className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold">Entregador da rota</p>
        {driverId ? (
          <Badge variant="secondary">{nameOf(driverId)}</Badge>
        ) : (
          <Badge variant="outline">Sem responsável</Badge>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Responsável por esta rota</Label>
          <Select value={value} onValueChange={setValue}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Escolher entregador" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Sem entregador</SelectItem>
              {drivers.map((p) => (
                <SelectItem key={p.user_id} value={p.user_id}>
                  {p.name} {p.role === 'operator' ? '(operador)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {needsReason && (
          <div>
            <Label>Motivo da troca (rota em execução)</Label>
            <Input
              className="mt-1"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex.: avaria da viatura"
            />
          </div>
        )}
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        {pending.length} entrega(s) pendente(s) nesta rota
        {inTransit.length > 0 ? ` — ${inTransit.length} já a caminho` : ''}. Todas as entregas da
        rota, mesmo as acrescentadas depois, ficam acessíveis ao entregador escolhido.
        {driverAssignedAt && (
          <>
            {' '}
            Última alteração por {nameOf(driverAssignedBy)} em{' '}
            {new Date(driverAssignedAt).toLocaleString('pt-PT')}.
          </>
        )}
      </p>

      {needsReason && (
        <p className="mt-2 flex items-start gap-1 text-xs text-warning">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />O que já foi confirmado mantém a
          autoria de quem entregou; só as entregas por fazer mudam de responsável.
        </p>
      )}

      <div className="mt-3 flex justify-end">
        <Button
          size="sm"
          disabled={assign.isPending || (needsReason && !reason.trim())}
          onClick={() =>
            void assign
              .mutateAsync({
                routeId,
                driverId: value === NONE ? null : value,
                reason: reason.trim() || undefined,
              })
              .then(() => setReason(''))
          }
        >
          {assign.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          Guardar e preparar entregas
        </Button>
      </div>
    </div>
  );
}
