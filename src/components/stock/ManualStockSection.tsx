import { useState, useMemo, useCallback, useEffect } from 'react';
import { Search, Plus, Minus, X, ShoppingCart, AlertTriangle, Layers, Package, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { useProducts } from '@/hooks/useProducts';
import { useCategories } from '@/hooks/useCategories';
import { MovementItem } from '@/hooks/useStockMovements';
import { OrderNumberEntrySelector, OrderNumberExitSelector } from './OrderNumberSelector';
import { OrderNumberEntry } from '@/types/stock';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface ManualStockSectionProps {
  cart: MovementItem[];
  onAddToCart: (item: MovementItem) => void;
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemoveFromCart: (productId: string) => void;
  movementType: 'entrada' | 'saida';
  stockOverrides?: Record<string, number>;
}

interface ProductWithInput {
  id: string;
  code: string;
  name: string;
  category: string;
  current_stock: number;
  total_colis: number;
}

interface ProductInputState {
  quantity: number;
  isCompleteSet: boolean;
  colisQuantities: Record<number, number>;
}

export function ManualStockSection({
  cart,
  onAddToCart,
  onUpdateQuantity,
  onRemoveFromCart,
  movementType,
  stockOverrides,
}: ManualStockSectionProps) {
  const { products, fetchProducts } = useProducts();
  const { categories } = useCategories();
  const [search, setSearch] = useState('');
  const [inputStates, setInputStates] = useState<Record<string, ProductInputState>>({});
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
  const [orderNumberProduct, setOrderNumberProduct] = useState<string | null>(null);
  const [orderSearchResults, setOrderSearchResults] = useState<Array<{
    product_id: string;
    order_number: string;
    colis_status: Record<string, boolean>;
  }>>([]);
  const [isSearchingOrders, setIsSearchingOrders] = useState(false);

  // Search for order numbers when term looks like an order number
  useEffect(() => {
    const searchOrders = async () => {
      const term = search.trim();
      // Only search orders if we're in exit mode and term has 3+ characters
      if (movementType !== 'saida' || term.length < 3) {
        setOrderSearchResults([]);
        return;
      }

      setIsSearchingOrders(true);
      try {
        const { data, error } = await supabase
          .from('stock_order_numbers')
          .select('product_id, order_number, colis_status')
          .ilike('order_number', `%${term}%`)
          .limit(20);

        if (error) throw error;
        setOrderSearchResults((data || []).map(d => ({
          product_id: d.product_id,
          order_number: d.order_number,
          colis_status: d.colis_status as Record<string, boolean> || {},
        })));
      } catch (error) {
        console.error('Error searching orders:', error);
        setOrderSearchResults([]);
      } finally {
        setIsSearchingOrders(false);
      }
    };

    const debounce = setTimeout(searchOrders, 300);
    return () => clearTimeout(debounce);
  }, [search, movementType]);

  // Map of category name -> requires_order_number
  const categoriesRequiringOrder = useMemo(() => {
    const map: Record<string, boolean> = {};
    categories.forEach(cat => {
      map[cat.name] = cat.requires_order_number || false;
    });
    return map;
  }, [categories]);

  // Map of category name -> colis_names
  const categoriesColisNames = useMemo(() => {
    const map: Record<string, Record<string, string> | null> = {};
    categories.forEach(cat => {
      map[cat.name] = cat.colis_names as Record<string, string> | null;
    });
    return map;
  }, [categories]);

  // Create stock map for quick lookup
  const stockMap = useMemo(() => {
    return products.reduce((acc, p) => {
      acc[p.id] = stockOverrides?.[p.id] ?? p.current_stock ?? 0;
      return acc;
    }, {} as Record<string, number>);
  }, [products, stockOverrides]);

  // Get products that have matching orders (for order search)
  const productsWithMatchingOrders = useMemo(() => {
    if (orderSearchResults.length === 0) return new Set<string>();
    return new Set(orderSearchResults.map(o => o.product_id));
  }, [orderSearchResults]);

  const filteredProducts = useMemo(() => {
    const term = search.toLowerCase().trim();
    
    // For exits with no search, show products with stock > 0
    if (!term && movementType === 'saida') {
      return products
        .filter(p => (p.current_stock ?? 0) > 0)
        .sort((a, b) => a.code.localeCompare(b.code));
    }
    
    if (!term) return [];

    // If we have order search results, prioritize those products
    if (movementType === 'saida' && orderSearchResults.length > 0) {
      // Get products that match the order search
      const orderMatchedProducts = products.filter(p => productsWithMatchingOrders.has(p.id));
      // Also include products that match by code/name
      const codeNameMatched = products.filter(p => 
        !productsWithMatchingOrders.has(p.id) && (
          p.code.toLowerCase().includes(term) || 
          p.name.toLowerCase().includes(term)
        )
      );
      return [...orderMatchedProducts, ...codeNameMatched].sort((a, b) => {
        // Prioritize order matches
        const aHasOrder = productsWithMatchingOrders.has(a.id);
        const bHasOrder = productsWithMatchingOrders.has(b.id);
        if (aHasOrder && !bHasOrder) return -1;
        if (!aHasOrder && bHasOrder) return 1;
        return a.code.localeCompare(b.code);
      });
    }
    
    return products
      .filter(p => 
        p.code.toLowerCase().includes(term) || 
        p.name.toLowerCase().includes(term)
      )
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [products, search, movementType, orderSearchResults, productsWithMatchingOrders]);

  const cartProductIds = new Set(cart.map(item => item.product_id));

  const getInputState = (productId: string, totalColis: number): ProductInputState => {
    if (inputStates[productId]) return inputStates[productId];
    return {
      quantity: 1,
      isCompleteSet: true,
      colisQuantities: Array.from({ length: totalColis }, (_, i) => [i + 1, 0]).reduce(
        (acc, [k, v]) => ({ ...acc, [k as number]: v as number }), {}
      ),
    };
  };

  const updateInputState = (productId: string, updates: Partial<ProductInputState>) => {
    setInputStates(prev => ({
      ...prev,
      [productId]: {
        ...getInputState(productId, products.find(p => p.id === productId)?.total_colis || 1),
        ...updates,
      },
    }));
  };

  const handleAddToCart = (product: ProductWithInput) => {
    const state = getInputState(product.id, product.total_colis);
    
    // Calculate quantity based on mode
    let finalQuantity = state.quantity;
    if (!state.isCompleteSet) {
      // For individual mode, quantity is min of all colis (complete sets that can be formed)
      const minColi = Math.min(...Object.values(state.colisQuantities));
      finalQuantity = minColi;
    }
    
    onAddToCart({
      product_id: product.id,
      product_code: product.code,
      product_name: product.name,
      quantity: finalQuantity,
      isCompleteSet: state.isCompleteSet,
      colisQuantities: state.isCompleteSet ? undefined : state.colisQuantities,
      totalColis: product.total_colis,
    });
    
    // Reset input state
    setInputStates(prev => {
      const newState = { ...prev };
      delete newState[product.id];
      return newState;
    });
    setExpandedProduct(null);
  };

  const totalQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Check if any item in cart exceeds available stock (for exits)
  const hasStockErrors = movementType === 'saida' && cart.some(
    item => item.quantity > (stockMap[item.product_id] || 0)
  );

  const toggleProductExpand = (productId: string, totalColis: number) => {
    if (totalColis === 1) return; // Don't expand single-coli products
    setExpandedProduct(prev => prev === productId ? null : productId);
  };

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
          <div className="relative">
            <Input
              placeholder={movementType === 'saida' 
                ? "Pesquisar por código, nome ou nº de encomenda..." 
                : "Pesquisar por código ou nome..."
              }
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-3"
            />
            {isSearchingOrders && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          {/* Order search results hint */}
          {movementType === 'saida' && orderSearchResults.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-md">
              <ClipboardList className="h-4 w-4" />
              <span>
                {orderSearchResults.length} encomenda(s) encontrada(s) - 
                produtos com encomendas aparecem primeiro
              </span>
            </div>
          )}

          {filteredProducts.length > 0 && (
            <div className="border rounded-lg overflow-x-auto">
              <ScrollArea className="h-[400px]">
                <Table className="min-w-[600px]">
                  <TableHeader className="sticky top-0 bg-muted z-10">
                    <TableRow>
                      <TableHead className="w-[80px] md:w-[120px]">Código</TableHead>
                      <TableHead className="min-w-[180px]">Nome</TableHead>
                      <TableHead className="w-[50px] md:w-[80px] text-center">Stock</TableHead>
                      <TableHead className="w-[50px] md:w-[80px] text-center hidden sm:table-cell">Colis</TableHead>
                      <TableHead className="w-[100px] md:w-[180px] text-right">Qtd.</TableHead>
                      <TableHead className="w-[50px] md:w-[60px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProducts.map((product) => {
                      const inCart = cartProductIds.has(product.id);
                      const stock = product.current_stock ?? 0;
                      const totalColis = product.total_colis || 1;
                      const isExpanded = expandedProduct === product.id;
                      const state = getInputState(product.id, totalColis);
                      const requiresOrder = categoriesRequiringOrder[product.category] || false;
                      const colisNames = categoriesColisNames[product.category] || null;
                      const isOrderNumberExpanded = orderNumberProduct === product.id;
                      
                      // Check if this product has matching orders from search
                      const matchingOrders = orderSearchResults.filter(o => o.product_id === product.id);
                      const hasMatchingOrders = matchingOrders.length > 0;

                      return (
                        <>
                          <TableRow 
                            key={product.id}
                            className={cn(
                              inCart && "bg-muted/50",
                              movementType === 'saida' && stock === 0 && "opacity-50",
                              hasMatchingOrders && "bg-amber-50/50 border-l-2 border-l-amber-400"
                            )}
                          >
                            <TableCell className="font-mono font-medium text-xs md:text-sm">
                              {product.code}
                            </TableCell>
                            <TableCell className="py-2">
                              <div className="flex flex-col gap-0.5">
                                <span className="text-sm leading-snug whitespace-normal break-words">
                                  {product.name}
                                </span>
                                {requiresOrder && (
                                  <Badge variant="outline" className="text-xs w-fit gap-1 bg-amber-50 text-amber-700 border-amber-300">
                                    <ClipboardList className="h-2.5 w-2.5" />
                                    Nº Enc.
                                  </Badge>
                                )}
                                {hasMatchingOrders && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {matchingOrders.slice(0, 3).map(o => (
                                      <Badge 
                                        key={o.order_number} 
                                        variant="secondary" 
                                        className="text-[10px] bg-amber-100 text-amber-800 border-amber-300"
                                      >
                                        {o.order_number}
                                      </Badge>
                                    ))}
                                    {matchingOrders.length > 3 && (
                                      <Badge variant="outline" className="text-[10px]">
                                        +{matchingOrders.length - 3}
                                      </Badge>
                                    )}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge 
                                variant={stock > 0 ? "secondary" : "outline"}
                                className={cn(stock === 0 && "text-muted-foreground")}
                              >
                                {stock}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center hidden sm:table-cell">
                              {totalColis > 1 ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 gap-1"
                                  onClick={() => toggleProductExpand(product.id, totalColis)}
                                >
                                  <Package className="h-3 w-3" />
                                  {totalColis}
                                </Button>
                              ) : (
                                <span className="text-muted-foreground">1</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {inCart ? (
                                <Badge variant="default" className="ml-auto">No carrinho</Badge>
                              ) : totalColis === 1 ? (
                                <div className="flex items-center justify-end gap-1">
                                  <div className="flex items-center border rounded-md bg-background">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={() => updateInputState(product.id, { 
                                        quantity: Math.max(1, state.quantity - 1) 
                                      })}
                                    >
                                      <Minus className="h-3 w-3" />
                                    </Button>
                                    <NumericInput
                                      min={1}
                                      value={state.quantity}
                                      onChange={(val) => updateInputState(product.id, { quantity: val })}
                                      className="h-7 w-12 text-center border-0 text-sm"
                                    />
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={() => updateInputState(product.id, { 
                                        quantity: state.quantity + 1 
                                      })}
                                    >
                                      <Plus className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center justify-end gap-1">
                                  {state.isCompleteSet ? (
                                    <Badge variant="outline" className="gap-1">
                                      <Layers className="h-3 w-3" />
                                      {state.quantity} sets
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="gap-1">
                                      <Package className="h-3 w-3" />
                                      Individual
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              {!inCart && (
                                requiresOrder ? (
                                  <Button
                                    size="sm"
                                    variant={isOrderNumberExpanded ? "default" : "ghost"}
                                    className="h-7 px-2 gap-1"
                                    onClick={() => setOrderNumberProduct(isOrderNumberExpanded ? null : product.id)}
                                    disabled={movementType === 'saida' && stock === 0}
                                  >
                                    <ClipboardList className="h-3 w-3" />
                                  </Button>
                                ) : totalColis === 1 ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0"
                                    onClick={() => handleAddToCart(product)}
                                    disabled={movementType === 'saida' && stock === 0}
                                  >
                                    <Plus className="h-4 w-4" />
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0"
                                    onClick={() => toggleProductExpand(product.id, totalColis)}
                                    disabled={movementType === 'saida' && stock === 0}
                                  >
                                    <Plus className="h-4 w-4" />
                                  </Button>
                                )
                              )}
                            </TableCell>
                          </TableRow>
                          
                          {/* Expanded row for order number input (entries) */}
                          {isOrderNumberExpanded && movementType === 'entrada' && (
                            <TableRow key={`${product.id}-order`} className="bg-amber-50/50">
                              <TableCell colSpan={6} className="p-3">
                                <OrderNumberEntrySelector
                                  productId={product.id}
                                  productCode={product.code}
                                  productName={product.name}
                                  totalColis={totalColis}
                                  currentStock={product.current_stock}
                                  colisNames={colisNames}
                                  onOrderAdded={() => {
                                    setOrderNumberProduct(null);
                                    fetchProducts();
                                  }}
                                />
                              </TableCell>
                            </TableRow>
                          )}
                          
                          {/* Expanded row for order number selection (exits) */}
                          {isOrderNumberExpanded && movementType === 'saida' && (
                            <TableRow key={`${product.id}-order-exit`} className="bg-amber-50/50">
                              <TableCell colSpan={6} className="p-3">
                                <OrderNumberExitSelector
                                  productId={product.id}
                                  productCode={product.code}
                                  productName={product.name}
                                  totalColis={totalColis}
                                  colisNames={colisNames}
                                  onAddToCart={(orderEntry: OrderNumberEntry) => {
                                    // Add to cart with order number reference
                                    onAddToCart({
                                      product_id: product.id,
                                      product_code: product.code,
                                      product_name: product.name,
                                      quantity: 1, // Each order = 1 complete set
                                      orderNumber: orderEntry.order_number,
                                      isCompleteSet: true,
                                    });
                                    setOrderNumberProduct(null);
                                  }}
                                />
                              </TableCell>
                            </TableRow>
                          )}
                          
                          {/* Expanded row for multi-colis products */}
                          {isExpanded && !inCart && totalColis > 1 && (
                            <TableRow key={`${product.id}-expanded`} className="bg-muted/20">
                              <TableCell colSpan={6} className="p-3">
                                <div className="space-y-3">
                                  {/* Mode Toggle */}
                                  <div className="flex gap-2">
                                    <Button
                                      type="button"
                                      variant={state.isCompleteSet ? "default" : "outline"}
                                      size="sm"
                                      className="gap-2"
                                      onClick={() => updateInputState(product.id, { isCompleteSet: true })}
                                    >
                                      <Layers className="h-4 w-4" />
                                      Set Completo
                                    </Button>
                                    <Button
                                      type="button"
                                      variant={!state.isCompleteSet ? "default" : "outline"}
                                      size="sm"
                                      className="gap-2"
                                      onClick={() => updateInputState(product.id, { isCompleteSet: false })}
                                    >
                                      <Package className="h-4 w-4" />
                                      Colis Individual
                                    </Button>
                                  </div>

                                  {/* Set Completo Mode */}
                                  {state.isCompleteSet && (
                                    <div className="space-y-2">
                                      <div className="flex items-center gap-2">
                                        <Label className="text-sm">Quantidade de sets:</Label>
                                        <div className="flex items-center border rounded-md bg-background">
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7"
                                            onClick={() => updateInputState(product.id, { 
                                              quantity: Math.max(1, state.quantity - 1) 
                                            })}
                                          >
                                            <Minus className="h-3 w-3" />
                                          </Button>
                                          <NumericInput
                                            min={1}
                                            value={state.quantity}
                                            onChange={(val) => updateInputState(product.id, { quantity: val })}
                                            className="h-7 w-14 text-center border-0 text-sm"
                                          />
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7"
                                            onClick={() => updateInputState(product.id, { 
                                              quantity: state.quantity + 1 
                                            })}
                                          >
                                            <Plus className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      </div>
                                      
                                      {/* Preview */}
                                      <div className="flex flex-wrap gap-1">
                                        {Array.from({ length: totalColis }, (_, i) => (
                                          <Badge key={i} variant="secondary" className="text-xs">
                                            Coli {i + 1}: {state.quantity} un.
                                          </Badge>
                                        ))}
                                      </div>
                                      <p className="text-xs text-primary font-medium">
                                        {movementType === 'entrada' ? 'Sets a adicionar' : 'Sets a retirar'}: {state.quantity}
                                      </p>
                                    </div>
                                  )}

                                  {/* Colis Individual Mode */}
                                  {!state.isCompleteSet && (
                                    <div className="space-y-2">
                                      <Label className="text-sm">Quantidade por coli:</Label>
                                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                        {Array.from({ length: totalColis }, (_, i) => {
                                          const colisNumber = i + 1;
                                          const qty = state.colisQuantities[colisNumber] || 0;
                                          
                                          return (
                                            <div key={colisNumber} className="flex items-center gap-1">
                                              <span className="text-xs text-muted-foreground w-12">Coli {colisNumber}:</span>
                                              <NumericInput
                                                min={0}
                                                value={qty}
                                                onChange={(val) => {
                                                  const newColisQuantities = {
                                                    ...state.colisQuantities,
                                                    [colisNumber]: val,
                                                  };
                                                  updateInputState(product.id, { colisQuantities: newColisQuantities });
                                                }}
                                                className="h-7 w-14 text-center text-sm"
                                              />
                                            </div>
                                          );
                                        })}
                                      </div>
                                      
                                      {/* Summary */}
                                      <div className="text-xs text-muted-foreground">
                                        <p>
                                          Total de unidades: {Object.values(state.colisQuantities).reduce((a, b) => a + b, 0)} • 
                                          Sets completos: <span className="text-primary font-medium">
                                            {Math.min(...Object.values(state.colisQuantities))}
                                          </span>
                                        </p>
                                      </div>
                                    </div>
                                  )}

                                  {/* Add button */}
                                  <Button
                                    size="sm"
                                    onClick={() => handleAddToCart(product)}
                                    disabled={movementType === 'saida' && stock === 0}
                                    className={movementType === 'entrada' ? 'bg-green-600 hover:bg-green-700' : ''}
                                  >
                                    <Plus className="h-4 w-4 mr-1" />
                                    Adicionar ao Carrinho
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
              <div className="px-3 py-2 border-t bg-muted/30 text-xs text-muted-foreground">
                {filteredProducts.length} produto{filteredProducts.length !== 1 ? 's' : ''} encontrado{filteredProducts.length !== 1 ? 's' : ''}
              </div>
            </div>
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
                  const totalColis = item.totalColis || 1;

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
                        <div className="flex items-center gap-2 mt-0.5">
                          {totalColis > 1 && (
                            <Badge variant="outline" className="text-xs gap-1">
                              {item.isCompleteSet !== false ? (
                                <>
                                  <Layers className="h-3 w-3" />
                                  {item.quantity} sets × {totalColis} colis
                                </>
                              ) : (
                                <>
                                  <Package className="h-3 w-3" />
                                  Individual: {Object.entries(item.colisQuantities || {})
                                    .map(([k, v]) => `C${k}:${v}`)
                                    .join(' ')}
                                </>
                              )}
                            </Badge>
                          )}
                          {movementType === 'saida' && (
                            <span className={cn(
                              "text-xs",
                              excedsStock ? "text-destructive font-medium" : "text-muted-foreground"
                            )}>
                              Stock: {availableStock} un.
                            </span>
                          )}
                          {excedsStock && (
                            <AlertTriangle className="h-3 w-3 text-destructive" />
                          )}
                        </div>
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
