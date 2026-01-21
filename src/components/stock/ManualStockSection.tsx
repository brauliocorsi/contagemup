import { useState, useMemo } from 'react';
import { Search, Plus, Minus, X, ShoppingCart, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useProducts } from '@/hooks/useProducts';
import { MovementItem } from '@/hooks/useStockMovements';
import { cn } from '@/lib/utils';

interface ManualStockSectionProps {
  cart: MovementItem[];
  onAddToCart: (item: MovementItem) => void;
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemoveFromCart: (productId: string) => void;
  movementType: 'entrada' | 'saida';
}

export function ManualStockSection({
  cart,
  onAddToCart,
  onUpdateQuantity,
  onRemoveFromCart,
  movementType,
}: ManualStockSectionProps) {
  const { products } = useProducts();
  const [search, setSearch] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  // Create stock map for quick lookup
  const stockMap = useMemo(() => {
    return products.reduce((acc, p) => {
      acc[p.id] = p.current_stock ?? 0;
      return acc;
    }, {} as Record<string, number>);
  }, [products]);

  const filteredProducts = useMemo(() => {
    const term = search.toLowerCase().trim();
    
    // For exits with no search, show products with stock > 0
    if (!term && movementType === 'saida') {
      return products
        .filter(p => (p.current_stock ?? 0) > 0)
        .slice(0, 10);
    }
    
    if (!term) return [];
    
    return products
      .filter(p => 
        p.code.toLowerCase().includes(term) || 
        p.name.toLowerCase().includes(term)
      )
      .slice(0, 10);
  }, [products, search, movementType]);

  const cartProductIds = new Set(cart.map(item => item.product_id));

  const handleAddToCart = (product: { id: string; code: string; name: string }) => {
    const quantity = quantities[product.id] || 1;
    onAddToCart({
      product_id: product.id,
      product_code: product.code,
      product_name: product.name,
      quantity,
    });
    setQuantities(prev => ({ ...prev, [product.id]: 1 }));
  };

  const totalQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Check if any item in cart exceeds available stock (for exits)
  const hasStockErrors = movementType === 'saida' && cart.some(
    item => item.quantity > (stockMap[item.product_id] || 0)
  );

  return (
    <div className="space-y-4">
      {/* Search Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4" />
            Seleção Manual
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Pesquisar por código ou nome..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          {filteredProducts.length > 0 && (
            <ScrollArea className="h-[200px]">
              <div className="space-y-2">
                {filteredProducts.map((product) => {
                  const inCart = cartProductIds.has(product.id);
                  const qty = quantities[product.id] || 1;

                  return (
                    <div
                      key={product.id}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        inCart ? 'bg-muted border-primary/30' : 'hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-sm font-medium">{product.code}</p>
                        <p className="text-sm text-muted-foreground truncate">{product.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Stock: {product.current_stock ?? 0} un.
                        </p>
                      </div>

                      {inCart ? (
                        <Badge variant="secondary">No carrinho</Badge>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="flex items-center border rounded-md">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setQuantities(prev => ({
                                ...prev,
                                [product.id]: Math.max(1, (prev[product.id] || 1) - 1)
                              }))}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <Input
                              type="number"
                              min="1"
                              value={qty}
                              onChange={(e) => setQuantities(prev => ({
                                ...prev,
                                [product.id]: Math.max(1, parseInt(e.target.value) || 1)
                              }))}
                              className="h-8 w-14 text-center border-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setQuantities(prev => ({
                                ...prev,
                                [product.id]: (prev[product.id] || 1) + 1
                              }))}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => handleAddToCart(product)}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}

          {search && filteredProducts.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhum produto encontrado
            </p>
          )}
        </CardContent>
      </Card>

      {/* Cart Section */}
      {cart.length > 0 && (
        <Card className={cn(hasStockErrors && "border-destructive/50")}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <ShoppingCart className="h-4 w-4" />
                Carrinho de {movementType === 'entrada' ? 'Entradas' : 'Saídas'}
                <Badge variant="secondary">{cart.length} itens</Badge>
                {hasStockErrors && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Stock insuficiente
                  </Badge>
                )}
              </CardTitle>
              <Badge>{totalQuantity} un. total</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px]">
              <div className="space-y-2">
                {cart.map((item) => {
                  const availableStock = stockMap[item.product_id] || 0;
                  const excedsStock = movementType === 'saida' && item.quantity > availableStock;

                  return (
                    <div
                      key={item.product_id}
                      className={cn(
                        "flex items-center justify-between p-2 rounded-md bg-muted",
                        excedsStock && "bg-destructive/10 border border-destructive/30"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-sm font-medium">{item.product_code}</p>
                        <p className="text-xs text-muted-foreground truncate">{item.product_name}</p>
                        {movementType === 'saida' && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className={cn(
                              "text-xs",
                              excedsStock ? "text-destructive font-medium" : "text-muted-foreground"
                            )}>
                              Stock: {availableStock} un.
                            </span>
                            {excedsStock && (
                              <AlertTriangle className="h-3 w-3 text-destructive" />
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex items-center border rounded-md bg-background">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => onUpdateQuantity(item.product_id, Math.max(1, item.quantity - 1))}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <Input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => onUpdateQuantity(item.product_id, Math.max(1, parseInt(e.target.value) || 1))}
                            className="h-7 w-12 text-center border-0 text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => onUpdateQuantity(item.product_id, item.quantity + 1)}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => onRemoveFromCart(item.product_id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
