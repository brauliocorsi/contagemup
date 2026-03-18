import { useState } from 'react';
import { Package, MapPin, Layers, ArrowUpCircle, ArrowDownCircle, Clock, AlertTriangle, History, Truck } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useProducts } from '@/hooks/useProducts';
import { useProductMovementHistory, useMovementUserNames } from '@/hooks/useProductMovementHistory';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';

interface ProductDetailPopupProps {
  productId: string | null;
  onClose: () => void;
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

  if (!product) return null;

  const isLowStock = product.current_stock <= product.min_stock;
  const hasDamaged = product.damaged_stock > 0;
  const availableStock = product.current_stock - product.damaged_stock;

  const getMovementIcon = (type: string) => {
    switch (type) {
      case 'entrada': return <ArrowUpCircle className="h-4 w-4 text-emerald-500" />;
      case 'saida': return <ArrowDownCircle className="h-4 w-4 text-red-500" />;
      case 'contagem_inc': return <ArrowUpCircle className="h-4 w-4 text-blue-500" />;
      case 'contagem_dec': return <ArrowDownCircle className="h-4 w-4 text-orange-500" />;
      case 'picking': return <Truck className="h-4 w-4 text-purple-500" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  const getMovementLabel = (type: string) => {
    switch (type) {
      case 'entrada': return 'Entrada';
      case 'saida': return 'Saída';
      case 'contagem_inc': return 'Contagem +';
      case 'contagem_dec': return 'Contagem -';
      case 'picking': return 'Picking';
      default: return type;
    }
  };

  const getMovementBadgeVariant = (type: string) => {
    switch (type) {
      case 'entrada':
      case 'contagem_inc':
        return 'default' as const;
      case 'saida':
      case 'contagem_dec':
      case 'picking':
        return 'destructive' as const;
      default:
        return 'secondary' as const;
    }
  };

  return (
    <Dialog open={!!productId} onOpenChange={(open) => { if (!open) { onClose(); setShowMovements(false); } }}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            {product.name}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <span className="font-mono">{product.code}</span>
            <span>•</span>
            <span>{product.category}</span>
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          {/* Stock Summary Cards */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="rounded-lg border bg-card p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Stock Atual</p>
              <p className={`text-2xl font-bold ${isLowStock ? 'text-destructive' : 'text-foreground'}`}>
                {product.current_stock}
              </p>
            </div>
            <div className="rounded-lg border bg-card p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Disponível</p>
              <p className="text-2xl font-bold text-primary">{availableStock}</p>
            </div>
            <div className="rounded-lg border bg-card p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Mín. Stock</p>
              <p className="text-2xl font-bold text-muted-foreground">{product.min_stock}</p>
            </div>
          </div>

          {/* Alerts */}
          {(isLowStock || hasDamaged) && (
            <div className="space-y-2 mb-4">
              {isLowStock && (
                <div className="flex items-center gap-2 p-2 rounded-md bg-destructive/10 text-destructive text-sm">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>Stock abaixo do mínimo ({product.min_stock})</span>
                </div>
              )}
              {hasDamaged && (
                <div className="flex items-center gap-2 p-2 rounded-md bg-orange-500/10 text-orange-600 dark:text-orange-400 text-sm">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{product.damaged_stock} unidade(s) danificada(s)</span>
                </div>
              )}
            </div>
          )}

          {/* Product Details */}
          <div className="space-y-2 mb-4">
            {product.location && (
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Localização:</span>
                <Badge variant="outline">{product.location}</Badge>
              </div>
            )}
            {product.pallet_number && (
              <div className="flex items-center gap-2 text-sm">
                <Layers className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Palete:</span>
                <Badge variant="outline">{product.pallet_number}</Badge>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm">
              <Package className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Volumes:</span>
              <Badge variant="outline">{product.total_colis} coli(s)</Badge>
            </div>
          </div>

          <Separator className="my-4" />

          {/* Movements Section */}
          {!showMovements ? (
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => setShowMovements(true)}
            >
              <History className="h-4 w-4" />
              Ver últimas entradas e saídas
            </Button>
          ) : (
            <div>
              <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <History className="h-4 w-4" />
                Últimos Movimentos
              </h4>
              {movementsLoading ? (
                <div className="text-center py-4 text-sm text-muted-foreground">A carregar...</div>
              ) : movements && movements.length > 0 ? (
                <div className="space-y-2">
                  {movements.slice(0, 20).map((m) => (
                    <div key={m.id} className="flex items-center gap-3 p-2 rounded-md border bg-card text-sm">
                      {getMovementIcon(m.type)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant={getMovementBadgeVariant(m.type)} className="text-[10px] px-1.5 py-0">
                            {getMovementLabel(m.type)}
                          </Badge>
                          <span className="font-semibold">{m.quantity} un</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                          <Clock className="h-3 w-3" />
                          {format(new Date(m.created_at), "dd/MM/yy HH:mm", { locale: pt })}
                          {m.created_by && userNames?.[m.created_by] && (
                            <span>• {userNames[m.created_by]}</span>
                          )}
                        </div>
                        {m.reference && (
                          <p className="text-xs text-muted-foreground truncate">Ref: {m.reference}</p>
                        )}
                        {m.session_name && (
                          <p className="text-xs text-muted-foreground truncate">Sessão: {m.session_name}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center py-4 text-sm text-muted-foreground">Sem movimentos registados</p>
              )}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
