import { useState } from 'react';
import { Printer, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { printLabels, printCommandSheet, type LabelItem } from '@/lib/scanner/labels';
import { toast } from 'sonner';

interface PrintMenuProps {
  /** Devolve as etiquetas a imprimir no momento do clique */
  getItems: () => LabelItem[];
  label?: string;
  disabled?: boolean;
  className?: string;
  variant?: 'default' | 'outline' | 'secondary' | 'ghost';
}

export function PrintMenu({ getItems, label = 'Imprimir', disabled, className, variant = 'outline' }: PrintMenuProps) {
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e: any) {
      console.error(e);
      toast.error('Erro ao gerar impressão');
    } finally {
      setBusy(false);
    }
  };

  const doPrint = (format: 'a4' | 'ql700' | 'thermal') =>
    run(async () => {
      const items = getItems();
      if (!items.length) {
        toast.info('Nada para imprimir');
        return;
      }
      await printLabels(items, format);
    });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant={variant} disabled={disabled || busy} className={className}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-50 bg-popover">
        <DropdownMenuLabel>Etiquetas</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => doPrint('ql700')}>Brother QL-700 (62x29mm)</DropdownMenuItem>
        <DropdownMenuItem onClick={() => doPrint('a4')}>Folha A4 (3x8)</DropdownMenuItem>
        <DropdownMenuItem onClick={() => doPrint('thermal')}>Térmica 100x50mm</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Operação</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => run(() => printCommandSheet('ql700'))}>
          Folha de comandos
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
