import { useState } from 'react';
import { CheckCircle2, Undo2, Ban, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLocationAudits, type LocationAuditItem } from '@/hooks/useLocationAudits';
import { cn } from '@/lib/utils';

/** Causas sugeridas; cada uma traz a decisão mais provável. */
export const SHORTAGE_CAUSES: Array<{ label: string; action: 'ajustar' | 'sem_ajuste' }> = [
  { label: 'Saída ou venda não registada', action: 'ajustar' },
  { label: 'Avaria ou perda', action: 'ajustar' },
  { label: 'Erro numa contagem anterior', action: 'ajustar' },
  { label: 'Produto está noutra localização', action: 'sem_ajuste' },
  { label: 'Recontar mais tarde', action: 'sem_ajuste' },
];
export const EXCESS_CAUSES: Array<{ label: string; action: 'ajustar' | 'sem_ajuste' }> = [
  { label: 'Entrada ou compra não registada', action: 'ajustar' },
  { label: 'Devolução não registada', action: 'ajustar' },
  { label: 'Erro numa contagem anterior', action: 'ajustar' },
  { label: 'Produto pertence a outra localização', action: 'sem_ajuste' },
  { label: 'Recontar mais tarde', action: 'sem_ajuste' },
];

interface Props {
  items: LocationAuditItem[];
  editable: boolean;
  isGlobal: boolean;
  /** "produto|coli" → texto com localizações no sistema. */
  locationsOf: (item: LocationAuditItem) => string;
}

export function DivergenceResolutionTable({ items, editable, isGlobal, locationsOf }: Props) {
  if (items.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma divergência — tudo bate certo.</p>;
  }
  return (
    <div className="h-full overflow-auto space-y-2 pr-1">
      {items.map((it) => (
        <DivergenceRow key={it.id} item={it} editable={editable} isGlobal={isGlobal} locations={locationsOf(it)} />
      ))}
    </div>
  );
}

function DivergenceRow({
  item,
  editable,
  isGlobal,
  locations,
}: {
  item: LocationAuditItem;
  editable: boolean;
  isGlobal: boolean;
  locations: string;
}) {
  const { resolveItem } = useLocationAudits();
  const diff = item.difference ?? 0;
  const shortage = diff < 0;
  const causes = shortage ? SHORTAGE_CAUSES : EXCESS_CAUSES;
  const [cause, setCause] = useState<string>('');
  const [note, setNote] = useState('');

  const n = Math.abs(diff);
  const happened = shortage
    ? `O sistema tinha ${item.expected_quantity}, contaram ${item.counted_quantity ?? 0}: faltam ${n}.`
    : `O sistema tinha ${item.expected_quantity}, contaram ${item.counted_quantity ?? 0}: há ${n} a mais.`;
  const effect = shortage
    ? `Se ajustar: saem ${n} do stock${isGlobal ? ' (primeiro do stock sem localização, depois das maiores quantidades)' : ` em ${item.location}`}.`
    : `Se ajustar: entram ${n} no stock em ${isGlobal ? 'CONF' : item.location}.`;

  const decide = (resolution: 'ajustar' | 'sem_ajuste') => {
    const reason = [cause, note.trim()].filter(Boolean).join(' — ');
    resolveItem.mutate({ itemId: item.id, resolution, reason });
  };

  return (
    <div
      className={cn(
        'rounded-md border p-3 space-y-2',
        item.applied_at ? 'bg-muted/40' : item.resolution ? 'border-primary/40' : 'border-destructive/40',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium break-words">{item.product_name}</p>
          <p className="font-mono text-xs text-muted-foreground">
            {item.product_code}
            {item.colis_number ? ` · C${item.colis_number}` : ''}
            {!isGlobal && ` · ${item.location}`}
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span>Sistema <b>{item.expected_quantity}</b></span>
          <span>Contado <b>{item.counted_quantity ?? '-'}</b></span>
          <Badge variant={shortage ? 'destructive' : 'default'}>
            {shortage ? `Falta ${n}` : `+${n} a mais`}
          </Badge>
        </div>
      </div>

      <div className="text-xs space-y-0.5">
        <p>{happened}</p>
        <p className="text-muted-foreground">No sistema está em: <span className="font-mono">{locations || 'sem stock registado'}</span></p>
        {!item.applied_at && !item.resolution && <p className="text-muted-foreground">{effect}</p>}
      </div>

      {item.applied_at ? (
        <p className="text-xs flex items-center gap-1 text-primary">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Ajustado: {item.quantity_before} → {item.quantity_after}
          {item.notes ? ` · ${item.notes}` : ''}
        </p>
      ) : item.resolution ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant={item.resolution === 'ajustar' ? 'default' : 'secondary'}>
            {item.resolution === 'ajustar' ? 'Vai ajustar o stock' : 'Fica sem ajuste'}
          </Badge>
          <span className="text-muted-foreground">Causa: {item.notes}</span>
          {editable && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7"
              onClick={() => resolveItem.mutate({ itemId: item.id, resolution: null, reason: '' })}
            >
              <Undo2 className="h-3.5 w-3.5 mr-1" />Mudar
            </Button>
          )}
        </div>
      ) : editable ? (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={cause} onValueChange={setCause}>
            <SelectTrigger className="h-8 w-[240px] text-xs"><SelectValue placeholder="O que aconteceu?" /></SelectTrigger>
            <SelectContent>
              {causes.map((c) => (
                <SelectItem key={c.label} value={c.label}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            className="h-8 flex-1 min-w-[160px] text-xs"
            placeholder="Detalhe (opcional), ex: venda 23554"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button
            size="sm"
            className="h-8"
            disabled={!cause || resolveItem.isPending}
            variant={causes.find((c) => c.label === cause)?.action === 'ajustar' ? 'default' : 'outline'}
            onClick={() => decide('ajustar')}
          >
            <Wrench className="h-3.5 w-3.5 mr-1" />Ajustar stock
          </Button>
          <Button
            size="sm"
            className="h-8"
            disabled={!cause || resolveItem.isPending}
            variant={causes.find((c) => c.label === cause)?.action === 'sem_ajuste' ? 'default' : 'outline'}
            onClick={() => decide('sem_ajuste')}
          >
            <Ban className="h-3.5 w-3.5 mr-1" />Não ajustar
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Sem decisão{item.notes ? ` · ${item.notes}` : ''}</p>
      )}
    </div>
  );
}
