import { useState } from 'react';
import { VendaInfo } from '@/hooks/useProductSales';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ShoppingCart, ChevronRight, ChevronLeft, User, Calendar, DollarSign, Package } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProductSalesPopoverProps {
  salesCount: number;
  sales: VendaInfo[];
  productCode: string;
}

export function ProductSalesPopover({ salesCount, sales, productCode }: ProductSalesPopoverProps) {
  const [selectedVenda, setSelectedVenda] = useState<VendaInfo | null>(null);

  if (salesCount === 0) return null;

  return (
    <Popover onOpenChange={(open) => { if (!open) setSelectedVenda(null); }}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100 hover:text-emerald-800"
        >
          <ShoppingCart className="h-3 w-3" />
          {salesCount}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end" side="left">
        {selectedVenda ? (
          // Venda detail view
          <div className="p-3">
            <div className="flex items-center gap-2 mb-3">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => setSelectedVenda(null)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="font-semibold text-sm">Venda #{selectedVenda.codigo}</span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Cliente:</span>
                <span className="font-medium truncate">{selectedVenda.cliente_nome}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Data:</span>
                <span className="font-medium">{selectedVenda.data}</span>
              </div>
              <div className="flex items-center gap-2">
                <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Total:</span>
                <span className="font-medium">R$ {parseFloat(selectedVenda.valor_total).toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">{selectedVenda.situacao}</Badge>
              </div>
              {selectedVenda.produtos.length > 0 && (
                <div className="mt-3 pt-2 border-t">
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    <Package className="h-3 w-3 inline mr-1" />
                    Produtos ({selectedVenda.produtos.length})
                  </p>
                  <div className="space-y-1.5">
                    {selectedVenda.produtos.map((item, idx) => (
                      <div 
                        key={idx} 
                        className={cn(
                          "text-xs p-1.5 rounded",
                          item.codigo === productCode ? "bg-emerald-50 border border-emerald-200" : "bg-muted/50"
                        )}
                      >
                        <div className="flex justify-between">
                          <span className="font-mono text-muted-foreground">{item.codigo}</span>
                          <span>{item.quantidade} un.</span>
                        </div>
                        <span className="truncate block">{item.nome}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          // Sales list view
          <div>
            <div className="p-3 border-b">
              <p className="font-semibold text-sm">
                <ShoppingCart className="h-4 w-4 inline mr-1" />
                {salesCount} venda(s) ativa(s)
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Excluindo: conferido, produto entregue, levantado, cancelado
              </p>
            </div>
            <ScrollArea className="max-h-[300px]">
              <div className="p-1">
                {sales.map((venda) => (
                  <button
                    key={venda.venda_id}
                    className="w-full flex items-center justify-between p-2 rounded hover:bg-muted/50 transition-colors text-left"
                    onClick={() => setSelectedVenda(venda)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium">#{venda.codigo}</span>
                        <Badge variant="outline" className="text-[10px] px-1 py-0">{venda.situacao}</Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span className="truncate">{venda.cliente_nome}</span>
                        <span>•</span>
                        <span>{venda.data}</span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
