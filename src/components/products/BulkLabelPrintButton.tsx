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
import { printLabels, type LabelFormat, type LabelItem } from '@/lib/scanner/labels';
import { fetchLastEntryDatesByCode } from '@/lib/scanner/entryDates';

export interface BulkLabelProduct {
  code: string;
  name: string;
  total_colis?: number | null;
  current_stock?: number | null;
}

/** Constrói etiquetas de vários produtos: uma etiqueta por unidade em stock, identificando o coli */
export function buildBulkLabels(
  products: BulkLabelProduct[],
  byColi: boolean,
  entryDates: Record<string, string> = {}
): LabelItem[] {
  const items: LabelItem[] = [];
  products.forEach((p) => {
    const code = (p.code || '').trim();
    if (!code) return;
    const total = Math.max(1, p.total_colis || 1);
    const copies = Math.max(1, p.current_stock ?? 0);
    const entryDate = entryDates[code] ?? null;
    if (byColi) {
      for (let n = 1; n <= total; n++) {
        items.push({
          code: `${code}-C${n}`,
          title: p.name,
          subtitle: `Código: ${code}`,
          extra: [`Coli ${n}/${total}`],
          entryDate,
          copies,
        });
      }
    } else {
      items.push({
        code,
        title: p.name,
        subtitle: `Código: ${code}`,
        entryDate,
        copies,
      });
    }
  });
  return items;
}



interface BulkLabelPrintButtonProps {
  /** Produtos a imprimir (avaliados no clique) */
  getProducts: () => BulkLabelProduct[];
  label?: string;
  variant?: 'default' | 'outline' | 'secondary' | 'ghost';
  size?: 'default' | 'sm';
  className?: string;
}

/** Impressão em lote de etiquetas de produtos com as respetivas quantidades */
export function BulkLabelPrintButton({
  getProducts,
  label = 'Etiquetas',
  variant = 'outline',
  size = 'default',
  className,
}: BulkLabelPrintButtonProps) {
  const [busy, setBusy] = useState(false);

  const run = async (byColi: boolean, format: LabelFormat) => {
    setBusy(true);
    try {
      const products = getProducts();
      const dates = await fetchLastEntryDatesByCode(products.map((p) => p.code));
      const items = buildBulkLabels(products, byColi, dates);
      if (!items.length) {
        toast.info('Nenhum produto com código para imprimir');
        return;
      }
      await printLabels(items, format, 'etiquetas-produtos.pdf');
      toast.success(`${items.length} etiqueta(s) geradas`);
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
        <Button type="button" variant={variant} size={size} disabled={busy} className={className}>
          {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Printer className="h-4 w-4 mr-2" />}
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-50 bg-popover w-64">
        <DropdownMenuLabel>Brother QL-700 (62x29mm)</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => run(true, 'ql700')}>Por coli (1 por unidade)</DropdownMenuItem>
        <DropdownMenuItem onClick={() => run(false, 'ql700')}>Por produto (1 por unidade)</DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel>Outros formatos</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => run(true, 'a4')}>Folha A4 (3x8)</DropdownMenuItem>
        <DropdownMenuItem onClick={() => run(true, 'thermal')}>Térmica 100x50mm</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
