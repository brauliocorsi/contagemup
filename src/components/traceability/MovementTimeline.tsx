import { useState } from 'react';
import {
  ArrowRight,
  ArrowDownToLine,
  ArrowUpFromLine,
  MoveRight,
  PackageCheck,
  Truck,
  AlertTriangle,
  Undo2,
  Loader2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useMovementTrace, type TraceStep } from '@/hooks/useMovementTrace';

interface Props {
  productId?: string | null;
  /** números de encomenda (nota de entrega ou rota) */
  references?: string[];
  title?: string;
  compact?: boolean;
}

function stepStyle(step: TraceStep) {
  const reason = (step.reason ?? '').toLowerCase();
  if (reason.includes('picking_para_doca'))
    return { icon: PackageCheck, cls: 'text-sky-600 bg-sky-100 dark:bg-sky-950/40' };
  if (reason.includes('carga_para_viatura'))
    return { icon: Truck, cls: 'text-indigo-600 bg-indigo-100 dark:bg-indigo-950/40' };
  if (reason.includes('arrum'))
    return { icon: MoveRight, cls: 'text-teal-600 bg-teal-100 dark:bg-teal-950/40' };
  if (reason.includes('quarentena') || reason.includes('avaria'))
    return { icon: AlertTriangle, cls: 'text-amber-600 bg-amber-100 dark:bg-amber-950/40' };
  if (reason.includes('devolu'))
    return { icon: Undo2, cls: 'text-orange-600 bg-orange-100 dark:bg-orange-950/40' };
  if (step.movement_type === 'entrada')
    return { icon: ArrowDownToLine, cls: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-950/40' };
  if (step.movement_type === 'saida')
    return { icon: ArrowUpFromLine, cls: 'text-rose-600 bg-rose-100 dark:bg-rose-950/40' };
  return { icon: MoveRight, cls: 'text-slate-600 bg-slate-100 dark:bg-slate-800' };
}

function when(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Caminho do produto: de onde saiu, por onde passou, para onde foi. */
export function MovementTimeline({ productId, references, title = 'Caminho do produto', compact }: Props) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [type, setType] = useState<'all' | 'entrada' | 'saida' | 'transferencia'>('all');

  const { data: steps = [], isLoading } = useMovementTrace({
    productId,
    references,
    from: from || undefined,
    to: to || undefined,
    type,
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <h3 className="mr-auto text-sm font-semibold">{title}</h3>
        <div className="grid gap-1">
          <Label className="text-[11px] text-muted-foreground">De</Label>
          <Input type="date" className="h-8 w-36" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label className="text-[11px] text-muted-foreground">Até</Label>
          <Input type="date" className="h-8 w-36" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label className="text-[11px] text-muted-foreground">Tipo</Label>
          <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
            <SelectTrigger className="h-8 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="entrada">Entradas</SelectItem>
              <SelectItem value="saida">Saídas</SelectItem>
              <SelectItem value="transferencia">Transferências</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> A carregar o percurso…
        </p>
      ) : steps.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Ainda não há movimentos registados.
        </p>
      ) : (
        <ol className="relative space-y-3 border-l border-border pl-4">
          {steps.map((s) => {
            const { icon: Icon, cls } = stepStyle(s);
            return (
              <li key={s.id} className="relative">
                <span
                  className={cn(
                    'absolute -left-[27px] flex h-6 w-6 items-center justify-center rounded-full',
                    cls,
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div
                  className={cn(
                    'rounded-lg border border-border bg-card p-3',
                    s.reversed && 'opacity-70',
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn('text-sm font-medium', s.reversed && 'line-through')}>
                      {s.label}
                    </span>
                    {s.reversed && (
                      <Badge variant="outline" className="border-destructive text-destructive">
                        Anulado
                      </Badge>
                    )}
                    <span className="ml-auto text-[11px] text-muted-foreground">{when(s.created_at)}</span>
                  </div>

                  {!compact && !productId && (s.product_name || s.product_code) && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      <span className="font-mono">{s.product_code}</span> · {s.product_name}
                    </p>
                  )}

                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      {s.from ?? 'origem não indicada'}
                      <ArrowRight className="h-3 w-3" />
                      {s.to ?? 'destino não indicado'}
                    </span>
                    <span className="font-medium text-foreground">{s.quantity} un.</span>
                    {s.reference && <span>Documento: {s.reference}</span>}
                    {s.user_name && <span>Por: {s.user_name}</span>}
                  </div>

                  {s.lines.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {s.lines.map((l, i) => (
                        <Badge key={`${s.id}-${i}`} variant="secondary" className="text-[10px]">
                          Coli {l.colis_number}: {l.quantity} un.
                          {l.location || l.location_to
                            ? ` (${l.location ?? '—'} → ${l.location_to ?? '—'})`
                            : ''}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
