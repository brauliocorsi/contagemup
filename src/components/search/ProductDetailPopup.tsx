import { useState, useMemo } from 'react';
import { Package, MapPin, Layers, ArrowUpCircle, ArrowDownCircle, AlertTriangle, Truck, Clock, Cloud, ShoppingCart, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useProducts } from '@/hooks/useProducts';
import { useProductMovementHistory, useMovementUserNames, UnifiedMovement } from '@/hooks/useProductMovementHistory';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { VendaInfo } from '@/hooks/useProductSales';

interface ProductDetailPopupProps {
  productId: string | null;
  onClose: () => void;
}

export function ProductDetailPopup({ productId, onClose }: ProductDetailPopupProps) {
  const [showSales, setShowSales] = useState(false);
  const { products } = useProducts();
  const { data: movements, isLoading } = useProductMovementHistory(productId);

  const product = products?.find(p => p.id === productId);
  const productCode = product?.code;

  // Fetch ERP stock from cache
  const { data: erpData } = useQuery({
    queryKey: ['erp-stock-lookup', productCode],
    queryFn: async () => {
      if (!productCode) return null;
      const { data } = await supabase
        .from('erp_products_cache')
        .select('erp_stock, fetched_at')
        .eq('code', productCode)
        .maybeSingle();
      return data;
    },
    enabled: !!productCode,
    staleTime: 60000,
  });

  // Fetch sales for this product
  const { data: salesData, isLoading: salesLoading } = useQuery({
    queryKey: ['product-sales-lookup', productCode],
    queryFn: async () => {
      if (!productCode) return [];
      const { data, error } = await supabase.functions.invoke('gestaoclick-vendas', {
        body: { skipCache: false },
      });
      if (error || data?.error) return [];
      const rawMap = (data?.productSalesMap || {}) as Record<string, VendaInfo[]>;
      const normalizedCode = productCode.trim().toLowerCase();
      return rawMap[normalizedCode] || [];
    },
    enabled: !!productCode && showSales,
    staleTime: 120000,
  });

  const userIds = movements
    ?.map(m => m.created_by)
    .filter((id): id is string => !!id)
    .filter((v, i, a) => a.indexOf(v) === i) || [];
  const { data: userNames } = useMovementUserNames(userIds);

  const { entries, exits } = useMemo(() => {
    if (!movements) return { entries: [], exits: [] };
    const e: UnifiedMovement[] = [];
    const x: UnifiedMovement[] = [];
    for (const m of movements) {
      if (m.type === 'entrada' || m.type === 'contagem_inc') e.push(m);
      else x.push(m);
    }
    return { entries: e.slice(0, 20), exits: x.slice(0, 20) };
  }, [movements]);

  if (!product) return null;

  const isLowStock = product.current_stock <= product.min_stock;
  const availableStock = product.current_stock - product.damaged_stock;
  const erpStock = erpData ? Number(erpData.erp_stock) : null;
  const erpDiff = erpStock !== null ? product.current_stock - product.damaged_stock - erpStock : null;

  const typeLabel = (t: string) => {
    switch (t) {
      case 'entrada': return 'Entrada';
      case 'contagem_inc': return 'Cont.+';
      case 'saida': return 'Saída';
      case 'contagem_dec': return 'Cont.-';
      case 'picking': return 'Picking';
      default: return t;
    }
  };

  return (
    <Dialog open={!!productId} onOpenChange={(open) => { if (!open) { onClose(); setShowSales(false); setSelectedVenda(null); } }}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              {product.name}
            </DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
              <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{product.code}</span>
              <Badge variant="outline" className="text-xs">{product.category}</Badge>
              {product.location && <span className="flex items-center gap-1 text-xs"><MapPin className="h-3 w-3" />{product.location}</span>}
              {product.pallet_number && <span className="flex items-center gap-1 text-xs"><Layers className="h-3 w-3" />{product.pallet_number}</span>}
              <span className="flex items-center gap-1 text-xs"><Package className="h-3 w-3" />{product.total_colis} coli(s)</span>
            </DialogDescription>
          </DialogHeader>

          {/* Stock Summary */}
          <div className="grid grid-cols-4 gap-2 mt-4">
            <div className={`rounded-xl border-2 p-3 text-center ${isLowStock ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-card'}`}>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Stock</p>
              <p className={`text-2xl font-bold tabular-nums ${isLowStock ? 'text-destructive' : 'text-foreground'}`}>{product.current_stock}</p>
            </div>
            <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-3 text-center">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Disponível</p>
              <p className="text-2xl font-bold tabular-nums text-primary">{availableStock}</p>
            </div>
            <div className="rounded-xl border-2 border-border bg-card p-3 text-center">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">ERP</p>
              {erpStock !== null ? (
                <p className="text-2xl font-bold tabular-nums text-foreground">{erpStock}</p>
              ) : (
                <p className="text-sm text-muted-foreground mt-1">—</p>
              )}
            </div>
            <div className="rounded-xl border-2 border-border bg-card p-3 text-center">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Mínimo</p>
              <p className="text-2xl font-bold tabular-nums text-muted-foreground">{product.min_stock}</p>
            </div>
          </div>

          {/* ERP Difference */}
          {erpDiff !== null && erpDiff !== 0 && (
            <div className={`flex items-center gap-2 mt-2 p-2 rounded-md text-xs ${erpDiff > 0 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-destructive/10 text-destructive'}`}>
              <Cloud className="h-3.5 w-3.5 shrink-0" />
              <span>Diferença Local vs ERP: <strong>{erpDiff > 0 ? '+' : ''}{erpDiff}</strong></span>
            </div>
          )}

          {(isLowStock || product.damaged_stock > 0) && (
            <div className="flex flex-wrap gap-2 mt-2">
              {isLowStock && <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Stock baixo</Badge>}
              {product.damaged_stock > 0 && <Badge variant="outline" className="gap-1 border-orange-400 text-orange-600 dark:text-orange-400"><AlertTriangle className="h-3 w-3" />{product.damaged_stock} danificado(s)</Badge>}
            </div>
          )}
          {/* Sales Button */}
          <div className="mt-3">
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2"
              onClick={() => { setShowSales(!showSales); setSelectedVenda(null); }}
            >
              <ShoppingCart className="h-4 w-4" />
              {showSales ? 'Ocultar vendas em aberto' : 'Ver vendas em aberto'}
              {salesData && salesData.length > 0 && (
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{salesData.length}</Badge>
              )}
            </Button>
          </div>

          {/* Sales Section */}
          {showSales && (
            <div className="mt-3">
              {salesLoading ? (
                <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  A carregar vendas...
                </div>
              ) : salesData && salesData.length > 0 ? (
                <div className="border rounded-lg divide-y">
                  {salesData.map((venda) => {
                    const prodItem = venda.produtos.find(p => p.codigo === product.code);
                    const qty = prodItem?.quantidade || '?';
                    return (
                      <div key={venda.venda_id} className="flex items-center justify-between px-3 py-2 text-sm">
                        <span className="font-mono font-medium">#{venda.codigo}</span>
                        <Badge variant="secondary" className="text-xs">{qty} un.</Badge>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-center py-3 text-sm text-muted-foreground">Sem vendas em aberto</p>
              )}
            </div>
          )}
        </div>

        <Separator />

        {/* Movements - Two Columns */}
        <ScrollArea className="flex-1 min-h-0 max-h-[380px]">
          <div className="px-6 py-4">
            {isLoading ? (
              <p className="text-center py-6 text-sm text-muted-foreground">A carregar...</p>
            ) : (
              <div className="grid grid-cols-2 gap-6">
                {/* Entries */}
                <div>
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b">
                    <ArrowUpCircle className="h-4 w-4 text-emerald-500" />
                    <h4 className="text-sm font-semibold">Entradas</h4>
                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{entries.length}</Badge>
                  </div>
                  {entries.length > 0 ? (
                    <div className="space-y-0">
                      {entries.map((m) => (
                        <div key={m.id} className="flex items-center justify-between py-1.5 text-sm border-b border-dashed border-border/50 last:border-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">+{m.quantity}</span>
                            <span className="text-xs text-muted-foreground">{typeLabel(m.type)}</span>
                          </div>
                          <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                            {format(new Date(m.created_at), "dd/MM/yy HH:mm", { locale: pt })}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-4">Sem entradas</p>
                  )}
                </div>

                {/* Exits */}
                <div>
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b">
                    <ArrowDownCircle className="h-4 w-4 text-destructive" />
                    <h4 className="text-sm font-semibold">Saídas</h4>
                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{exits.length}</Badge>
                  </div>
                  {exits.length > 0 ? (
                    <div className="space-y-0">
                      {exits.map((m) => (
                        <div key={m.id} className="flex items-center justify-between py-1.5 text-sm border-b border-dashed border-border/50 last:border-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-semibold text-destructive tabular-nums">-{m.quantity}</span>
                            <span className="text-xs text-muted-foreground">{typeLabel(m.type)}</span>
                          </div>
                          <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                            {format(new Date(m.created_at), "dd/MM/yy HH:mm", { locale: pt })}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-4">Sem saídas</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
