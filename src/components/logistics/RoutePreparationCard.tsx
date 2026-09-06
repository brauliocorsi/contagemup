import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, Loader2, Lock, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  useCloseRoutePreparation,
  useImportPrevisto,
  useReopenRoutePreparation,
  useRouteImports,
  useRoutePayables,
} from '@/hooks/useDeliveryFinance';
import { formatCents } from '@/lib/finance/money';

interface Props {
  routeId: string;
  preparationClosedAt: string | null;
  compositionVersion: number;
  financialStatus: string;
}

/**
 * Preparação da rota e importação do previsto. São dois fechos distintos:
 * fechar a preparação (antes de sair) não é fechar a prestação de contas
 * (depois de executar) nem a conferência do financeiro.
 */
export function RoutePreparationCard({
  routeId,
  preparationClosedAt,
  compositionVersion,
  financialStatus,
}: Props) {
  const { data: imports = [] } = useRouteImports(routeId);
  const { data: payables = [] } = useRoutePayables(routeId);
  const close = useCloseRoutePreparation();
  const reopen = useReopenRoutePreparation();
  const importPrevisto = useImportPrevisto();
  const [reason, setReason] = useState('');

  const last = imports[0];
  const stale = last && (last.invalidated_at || last.composition_version !== compositionVersion);
  const toCollect = payables
    .filter((p) => p.classification === 'collect_on_delivery')
    .reduce((s, p) => s + p.amount_cents, 0);
  const alreadyPaid = payables
    .filter((p) => p.classification === 'already_paid')
    .reduce((s, p) => s + p.amount_cents, 0);
  const unknown = payables.filter((p) => p.classification === 'unknown');

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">Preparação e valores da rota</span>
          <Badge variant={preparationClosedAt ? 'default' : 'secondary'}>
            {preparationClosedAt ? 'Preparação fechada' : 'Preparação aberta'}
          </Badge>
          <Badge variant="outline">Composição v{compositionVersion}</Badge>
          <Badge variant="outline">Contas: {financialStatus}</Badge>
        </div>

        <div className="flex flex-wrap gap-2">
          {preparationClosedAt ? (
            <div className="flex flex-1 gap-2">
              <Input
                placeholder="Motivo para reabrir a preparação"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <Button
                variant="outline"
                disabled={!reason.trim() || reopen.isPending}
                onClick={() => reopen.mutate({ routeId, reason })}
              >
                <Unlock className="mr-1 h-4 w-4" /> Reabrir
              </Button>
            </div>
          ) : (
            <Button variant="outline" disabled={close.isPending} onClick={() => close.mutate(routeId)}>
              <Lock className="mr-1 h-4 w-4" /> Fechar preparação
            </Button>
          )}

          <Button
            disabled={importPrevisto.isPending}
            onClick={() => importPrevisto.mutate({ routeId })}
          >
            {importPrevisto.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-1 h-4 w-4" />
            )}
            Importar previsto
          </Button>
        </div>

        {payables.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border p-3 text-sm">
              <p className="text-xs text-muted-foreground">A cobrar na entrega</p>
              <strong>{formatCents(toCollect)}</strong>
            </div>
            <div className="rounded-lg border p-3 text-sm">
              <p className="text-xs text-muted-foreground">Já pago na Gestão Click</p>
              <strong>{formatCents(alreadyPaid)}</strong>
            </div>
            <div className="rounded-lg border p-3 text-sm">
              <p className="text-xs text-muted-foreground">Parcelas por rever</p>
              <strong>{unknown.length}</strong>
            </div>
          </div>
        )}

        {last && (
          <div className="space-y-1 text-xs text-muted-foreground">
            <p className="flex items-center gap-1">
              {last.status === 'completed' && !stale ? (
                <CheckCircle2 className="h-3 w-3 text-success" />
              ) : (
                <AlertTriangle className="h-3 w-3 text-warning" />
              )}
              Última importação: {new Date(last.created_at).toLocaleString('pt-PT')} —{' '}
              {last.notes_ok} nota(s) importadas, {last.notes_failed} por resolver.
            </p>
            {stale && (
              <p className="text-warning">
                {last.invalidated_reason ??
                  'A composição da rota mudou depois desta importação: importe de novo antes de sair.'}
              </p>
            )}
            {last.failures?.map((f) => (
              <p key={f.note_id} className="text-warning">
                Encomenda {f.order_number}: {f.reason}{' '}
                <button
                  className="underline"
                  onClick={() => importPrevisto.mutate({ routeId, noteIds: [f.note_id] })}
                >
                  tentar de novo
                </button>
              </p>
            ))}
          </div>
        )}

        {unknown.length > 0 && (
          <div className="rounded-lg border border-warning/50 bg-warning/10 p-3 text-xs">
            <p className="mb-1 font-medium">Parcelas que precisam de revisão antes de cobrar</p>
            {unknown.slice(0, 8).map((p) => (
              <p key={p.id}>
                {p.gc_sale_code}: {formatCents(p.amount_cents)} — {p.exception_note}
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
