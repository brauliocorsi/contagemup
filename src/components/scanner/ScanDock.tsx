import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, MapPin, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

/** Resumo grande do que acabou de ser lido — é aqui que o operador olha. */
export interface LastScan {
  kind: 'produto' | 'localizacao' | 'viatura' | 'rota' | 'nota' | 'erro' | 'ok';
  title: string;
  detail?: string;
  /** Ex.: "3 / 8" */
  quantity?: string;
  /** Ex.: "faltam 5" */
  remaining?: string;
}

const TONE: Record<LastScan['kind'], string> = {
  produto: 'border-primary/50 bg-primary/10',
  localizacao: 'border-info/50 bg-info-soft',
  viatura: 'border-info/50 bg-info-soft',
  rota: 'border-info/50 bg-info-soft',
  nota: 'border-info/50 bg-info-soft',
  ok: 'border-success/50 bg-success-soft',
  erro: 'border-destructive/60 bg-destructive/10',
};

function KindIcon({ kind }: { kind: LastScan['kind'] }) {
  if (kind === 'erro') return <AlertTriangle className="h-5 w-5 text-destructive" />;
  if (kind === 'ok') return <CheckCircle2 className="h-5 w-5 text-success" />;
  if (kind === 'produto') return <Package className="h-5 w-5 text-primary" />;
  return <MapPin className="h-5 w-5 text-info" />;
}

export function LastScanPanel({ last }: { last: LastScan | null }) {
  if (!last) {
    return (
      <div className="rounded-xl border border-dashed p-3 text-center text-xs text-muted-foreground">
        Último lido aparece aqui em letra grande.
      </div>
    );
  }
  return (
    <div className={cn('flex items-center gap-3 rounded-xl border p-3', TONE[last.kind])}>
      <KindIcon kind={last.kind} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-lg font-bold leading-tight">{last.title}</p>
        {last.detail && <p className="truncate text-xs text-muted-foreground">{last.detail}</p>}
      </div>
      <div className="shrink-0 text-right">
        {last.quantity && <p className="text-2xl font-extrabold tabular-nums leading-none">{last.quantity}</p>}
        {last.remaining && <p className="text-[11px] text-muted-foreground">{last.remaining}</p>}
      </div>
    </div>
  );
}

interface ScanDockProps {
  /** Campo de leitura (fica sempre visível no topo). */
  children: ReactNode;
  last?: LastScan | null;
  /** Contador de progresso sempre visível. */
  progress?: { done: number; total: number; label?: string };
  className?: string;
}

/** Zona fixa no topo: campo de leitura + último lido + progresso. */
export function ScanDock({ children, last, progress, className }: ScanDockProps) {
  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <div className={cn('sticky top-[57px] z-30 -mx-4 space-y-2 border-b bg-background/95 px-4 py-3 backdrop-blur', className)}>
      {children}
      {progress && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
            <span>{progress.label ?? 'Progresso'}</span>
            <span className="tabular-nums">
              {progress.done} / {progress.total}
            </span>
          </div>
          <Progress value={pct} className="h-1.5" />
        </div>
      )}
      <LastScanPanel last={last ?? null} />
    </div>
  );
}
