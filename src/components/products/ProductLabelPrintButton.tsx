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
import { toast } from 'sonner';
import { printLabels, productColiLabels, productLabel, type LabelFormat } from '@/lib/scanner/labels';
import { fetchLastEntryDatesByCode } from '@/lib/scanner/entryDates';

interface ProductLabelPrintButtonProps {
  product: { code: string; name: string; total_colis?: number | null };
  className?: string;
}

/** Impressão de etiquetas de um produto (por coli ou etiqueta única) */
export function ProductLabelPrintButton({ product, className }: ProductLabelPrintButtonProps) {
  const [busy, setBusy] = useState(false);
  const totalColis = Math.max(1, product.total_colis || 1);

  const run = async (byColi: boolean, format: LabelFormat) => {
    if (!product.code?.trim()) {
      toast.error('Produto sem código — não é possível gerar etiqueta');
      return;
    }
    setBusy(true);
    try {
      const dates = await fetchLastEntryDatesByCode([product.code]);
      const entryDate = dates[product.code.trim()] ?? null;
      const items = byColi
        ? productColiLabels(product, { entryDate })
        : [productLabel(product, { entryDate })];
      await printLabels(items, format, `etiquetas-${product.code}.pdf`);
    } catch (e) {
      console.error(e);
      toast.error('Erro ao gerar etiquetas');
    } finally {
      setBusy(false);
    }
  };


  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={className}
          title="Imprimir etiqueta"
          onClick={(e) => e.stopPropagation()}
          disabled={busy}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-50 bg-popover">
        <DropdownMenuLabel>Brother QL-700 (62x29mm)</DropdownMenuLabel>
        {totalColis > 1 && (
          <DropdownMenuItem onClick={() => run(true, 'ql700')}>
            Por coli ({totalColis} etiquetas)
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => run(false, 'ql700')}>Etiqueta do produto</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Outros formatos</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => run(totalColis > 1, 'a4')}>Folha A4 (3x8)</DropdownMenuItem>
        <DropdownMenuItem onClick={() => run(totalColis > 1, 'thermal')}>Térmica 100x50mm</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
