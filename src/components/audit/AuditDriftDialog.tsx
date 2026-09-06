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
import type { AuditDriftLine } from '@/hooks/useLocationAudits';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lines: AuditDriftLine[];
  /** Fecha a conferência aceitando que o stock mudou depois da contagem. */
  onConfirm: () => void;
  pending?: boolean;
}

/**
 * Aviso de stock movimentado entre a contagem e o fecho.
 *
 * O fecho é recusado por defeito: aplicar o valor contado por cima de stock que
 * entretanto se moveu apagaria o trabalho de outra pessoa.
 */
export function AuditDriftDialog({ open, onOpenChange, lines, onConfirm, pending }: Props) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>O stock mudou depois da contagem</AlertDialogTitle>
          <AlertDialogDescription>
            {lines.length} linha(s) já não têm o saldo que tinham quando a contagem foi feita —
            houve saídas, entradas ou transferências entretanto. Confirme com quem contou antes de
            avançar.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="max-h-64 space-y-1 overflow-auto rounded-lg border p-2 text-xs">
          {lines.map((l) => (
            <div key={l.item_id} className="flex items-center justify-between gap-2">
              <span className="truncate font-mono">
                {l.product_code}
                {l.colis_number ? `-C${l.colis_number}` : ''} · {l.location}
              </span>
              <span className="shrink-0 text-muted-foreground">
                referência {l.reference} → agora {l.current}
              </span>
            </div>
          ))}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Não fechar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={pending}>
            Fechar mesmo assim
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
