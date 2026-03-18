import { useState, useMemo } from 'react';
import { Package, MapPin, Layers, ArrowUpCircle, ArrowDownCircle, Clock, AlertTriangle, History, Truck } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useProducts } from '@/hooks/useProducts';
import { useProductMovementHistory, useMovementUserNames, UnifiedMovement } from '@/hooks/useProductMovementHistory';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';

interface ProductDetailPopupProps {
  productId: string | null;
  onClose: () => void;
}

function MovementRow({ m, userName }: { m: UnifiedMovement; userName?: string }) {
  const isEntry = m.type === 'entrada' || m.type === 'contagem_inc';

  const icon = (() => {
    switch (m.type) {
      case 'entrada': return <ArrowUpCircle className="h-4 w-4 text-emerald-500" />;
      case 'saida': return <ArrowDownCircle className="h-4 w-4 text-destructive" />;
      case 'contagem_inc': return <ArrowUpCircle className="h-4 w-4 text-blue-500" />;
      case 'contagem_dec': return <ArrowDownCircle className="h-4 w-4 text-orange-500" />;
      case 'picking': return <Truck className="h-4 w-4 text-purple-500" />;
      default: return <Clock className="h-4 w-4" />;
    }
  })();

  const label = (() => {
    switch (m.type) {
      case 'entrada': return 'Entrada';
      case 'saida': return 'Saída';
      case 'contagem_inc': return 'Contagem +';
      case 'contagem_dec': return 'Contagem -';
      case 'picking': return 'Picking';
      default: return m.type;
    }
  })();

  return (
    <div className="flex items-center gap-2.5 py-2 px-2.5 rounded-md border bg-card hover:bg-accent/50 transition-colors">
      {icon}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-sm">{isEntry ? '+' : '-'}{m.quantity}</span>
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
          {format(new Date(m.created_at), "dd/MM HH:mm", { locale: pt })}
          {userName && ` • ${userName}`}
          {m.reference && ` • ${m.reference}`}
          {m.session_name && ` • ${m.session_name}`}
        </div>
      </div>
    </div>
  );
}

export function ProductDetailPopup({ productId, onClose }: ProductDetailPopupProps) {
  const [showMovements, setShowMovements] = useState(false);
  const { products } = useProducts();
  const { data: movements, isLoading: movementsLoading } = useProductMovementHistory(showMovements ? productId : null);

  const product = products?.find(p => p.id === productId);

  const userIds = movements
    ?.map(m => m.created_by)
    .filter((id): id is string => !!id)
    .filter((v, i, a) => a.indexOf(v) === i) || [];
  const { data: userNames } = useMovementUserNames(userIds);

  const { entries, exits } = useMemo(() => {
    if (!movements) return { entries: [], exits: [] };
    const e: UnifiedMovement[] = [];
    const x: UnifiedMovement[] = [];
    for (const m of movements.slice(0, 30)) {
      if (m.type === 'entrada' || m.type === 'contagem_inc') e.push(m);
      else x.push(m);
    }
    return { entries: e.slice(0, 15), exits: x.slice(0, 15) };
  }, [movements]);

  if (!product) return null;

  const isLowStock = product.current_stock <= product.min_stock;
  const hasDamaged = product.damaged_stock > 0;
  const availableStock = product.current_stock - product.damaged_stock;

  return (
    <Dialog open={!!productId} onOpenChange={(open) => { if (!open) { onClose(); setShowMovements(false); } }}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Package className="h-5 w-5 text-primary" />
              {product.name}
            </DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
              <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{product.code}</span>
              <Badge variant="outline" className="text-xs">{product.category}</Badge>
              {product.location && (
                <span className="flex items-center gap-1 text-xs">
                  <MapPin className="h-3 w-3" />{product.location}
                </span>
              )}
              {product.pallet_number && (
                <span className="flex items-center gap-1 text-xs">
                  <Layers className="h-3 w-3" />{product.pallet_number}
                </span>
              )}
              <span className="flex items-center gap-1 text-xs">
                <Package className="h-3 w-3" />{product.total_colis} coli(s)
              </span>
            </DialogDescription>
          </DialogHeader>

          {/* Stock Cards */}
          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className={`rounded-xl border-2 p-3 text-center transition-colors ${isLowStock ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-card'}`}>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Stock</p>
              <p className={`text-3xl font-bold tabular-nums ${isLowStock ? 'text-destructive' : 'text-foreground'}`}>
                {product.current_stock}
              </p>
            </div>
            <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-3 text-center">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Disponível</p>
              <p className="text-3xl font-bold tabular-nums text-primary">{availableStock}</p>
            </div>
            <div className="rounded-xl border-2 border-border bg-card p-3 text-center">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Mínimo</p>
              <p className="text-3xl font-bold tabular-nums text-muted-foreground">{product.min_stock}</p>
            </div>
          </div>

          {/* Alerts */}
          {(isLowStock || hasDamaged) && (
            <div className="flex flex-wrap gap-2 mt-3">
              {isLowStock && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Stock baixo
                </Badge>
              )}
              {hasDamaged && (
                <Badge variant="outline" className="gap-1 border-orange-400 text-orange-600 dark:text-orange-400">
                  <AlertTriangle className="h-3 w-3" />
                  {product.damaged_stock} danificado(s)
                </Badge>
              )}
            </div>
          )}
        </div>

        <Separator />

        {/* Movements */}
        <div className="flex-1 min-h-0">
          {!showMovements ? (
            <div className="flex items-center justify-center py-8 px-6">
              <Button variant="outline" size="lg" className="gap-2" onClick={() => setShowMovements(true)}>
                <History className="h-4 w-4" />
                Ver últimas entradas e saídas
              </Button>
            </div>
          ) : (
            <ScrollArea className="h-[320px]">
              <div className="px-6 py-4">
                {movementsLoading ? (
                  <div className="text-center py-8 text-sm text-muted-foreground">A carregar movimentos...</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Entries Column */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="h-2 w-2 rounded-full bg-emerald-500" />
                        <h4 className="text-sm font-semibold text-foreground">Entradas</h4>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{entries.length}</Badge>
                      </div>
                      {entries.length > 0 ? (
                        <div className="space-y-1.5">
                          {entries.map((m) => (
                            <MovementRow key={m.id} m={m} userName={m.created_by ? userNames?.[m.created_by] : undefined} />
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground text-center py-4">Sem entradas recentes</p>
                      )}
                    </div>

                    {/* Exits Column */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="h-2 w-2 rounded-full bg-destructive" />
                        <h4 className="text-sm font-semibold text-foreground">Saídas</h4>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{exits.length}</Badge>
                      </div>
                      {exits.length > 0 ? (
                        <div className="space-y-1.5">
                          {exits.map((m) => (
                            <MovementRow key={m.id} m={m} userName={m.created_by ? userNames?.[m.created_by] : undefined} />
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground text-center py-4">Sem saídas recentes</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
