import { useState, useCallback, useMemo } from 'react';
import { TrendingDown, History, AlertTriangle, ClipboardList, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useStockMovements, MovementItem, ParsedCSVItem } from '@/hooks/useStockMovements';
import { usePickingHistory } from '@/hooks/usePickingHistory';
import { useDetailedPickingData } from '@/hooks/useDetailedPickingData';
import { useProducts } from '@/hooks/useProducts';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { StockUploadSection, ParsedItemsPreview } from './StockUploadSection';
import { ManualStockSection } from './ManualStockSection';
import { StockHistoryTable } from './StockHistoryTable';
import { PickingHistoryView } from './PickingHistoryView';
import { StockValidationDialog, StockValidationError } from './StockValidationDialog';
import { PickingReportDialog } from './PickingReportDialog';
import { toast } from 'sonner';

const EXIT_REASONS = [
  'Venda',
  'Quebra',
  'Perda',
  'Transferência',
  'Devolução a fornecedor',
  'Ajuste de inventário',
  'Amostra',
  'Outro',
];

export function StockExitsView() {
  const queryClient = useQueryClient();
  const {
    movements,
    isLoading,
    isProcessing,
    parseStockFile,
    deleteMovement,
  } = useStockMovements('saida');

  const { createSession } = usePickingHistory();
  const { products } = useProducts();

  const [parsedItems, setParsedItems] = useState<ParsedCSVItem[]>([]);
  const [cart, setCart] = useState<MovementItem[]>([]);
  const [reason, setReason] = useState<string>('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [activeTab, setActiveTab] = useState('saidas');
  
  // Validation dialog state
  const [validationErrors, setValidationErrors] = useState<StockValidationError[]>([]);
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const [colisValidationMessage, setColisValidationMessage] = useState<string | null>(null);
  
  // Picking report dialog state
  const [showPickingReport, setShowPickingReport] = useState(false);
  const [itemsForPicking, setItemsForPicking] = useState<MovementItem[]>([]);

  // Create stock map for validation
  const stockMap = useMemo(() => {
    return products.reduce((acc, p) => {
      acc[p.id] = p.current_stock ?? 0;
      return acc;
    }, {} as Record<string, number>);
  }, [products]);

  // Combine CSV items and manual cart
  const allItems: MovementItem[] = useMemo(() => [
    ...parsedItems
      .filter(i => i.valid && i.product_id)
      .map(i => ({
        product_id: i.product_id!,
        product_code: i.code,
        product_name: i.product_name || '',
        quantity: i.quantity,
      })),
    ...cart,
  ], [parsedItems, cart]);

  // Check for stock validation errors
  const stockErrors = useMemo(() => {
    return allItems.filter(item => {
      const available = stockMap[item.product_id] || 0;
      return item.quantity > available;
    }).map(item => ({
      product_id: item.product_id,
      product_code: item.product_code,
      product_name: item.product_name,
      requested: item.quantity,
      available: stockMap[item.product_id] || 0,
    }));
  }, [allItems, stockMap]);

  const hasStockErrors = stockErrors.length > 0;

  // Fetch detailed picking data when showing report
  const { data: detailedPickingItems = [], isLoading: isLoadingPickingData } = useDetailedPickingData(
    showPickingReport ? itemsForPicking : []
  );

  const handleAddToCart = useCallback((item: MovementItem) => {
    setCart(prev => {
      const existing = prev.find(i => i.product_id === item.product_id);
      if (existing) {
        return prev.map(i =>
          i.product_id === item.product_id
            ? { ...i, quantity: i.quantity + item.quantity }
            : i
        );
      }
      return [...prev, item];
    });
  }, []);

  const handleUpdateQuantity = useCallback((productId: string, quantity: number) => {
    setCart(prev =>
      prev.map(item =>
        item.product_id === productId ? { ...item, quantity } : item
      )
    );
  }, []);

  const handleRemoveFromCart = useCallback((productId: string) => {
    setCart(prev => prev.filter(item => item.product_id !== productId));
  }, []);

  // Validate colis stock for complete sets
  const validateColisStock = async (items: MovementItem[]): Promise<{ valid: boolean; message?: string }> => {
    for (const item of items) {
      // Only validate complete set mode for multi-colis products
      if (item.isCompleteSet === false) continue;
      
      const product = products.find(p => p.id === item.product_id);
      if (!product || product.total_colis <= 1) continue;
      
      // Fetch stock for each coli
      const { data: counts } = await supabase
        .from('counts')
        .select('colis_number, quantity')
        .eq('product_id', item.product_id);
      
      if (!counts) continue;
      
      // Calculate stock per coli
      const colisStock: Record<number, number> = {};
      for (let i = 1; i <= product.total_colis; i++) {
        colisStock[i] = 0;
      }
      counts.forEach(c => {
        if (colisStock[c.colis_number] !== undefined) {
          colisStock[c.colis_number] += c.quantity;
        }
      });
      
      // Check if any coli has insufficient stock
      for (let i = 1; i <= product.total_colis; i++) {
        if (colisStock[i] < item.quantity) {
          const minStock = Math.min(...Object.values(colisStock));
          return {
            valid: false,
            message: `Produto "${item.product_name}" só tem ${minStock} sets completos disponíveis (Coli ${i} limita com ${colisStock[i]} un.). Pedido: ${item.quantity} sets.`
          };
        }
      }
    }
    return { valid: true };
  };

  // Validate and show picking report
  const handleValidateAndConfirm = async () => {
    if (allItems.length === 0) return;

    // Check for stock validation errors (total stock)
    if (hasStockErrors) {
      setValidationErrors(stockErrors);
      setShowValidationDialog(true);
      return;
    }
    
    // Check colis-level stock for complete sets
    const colisValidation = await validateColisStock(allItems);
    if (!colisValidation.valid) {
      setColisValidationMessage(colisValidation.message || null);
      return;
    }
    setColisValidationMessage(null);

    // All good, show picking report
    showPickingReportWithItems(allItems);
  };
  
  // Show picking report with prepared items
  const showPickingReportWithItems = (items: MovementItem[]) => {
    setItemsForPicking(items);
    setShowPickingReport(true);
  };

  // Handle adjusting quantities to available stock
  const handleAdjustQuantities = () => {
    // For cart items, update to available stock
    setCart(prev => prev.map(item => {
      const available = stockMap[item.product_id] || 0;
      if (item.quantity > available) {
        return { ...item, quantity: Math.max(1, available) };
      }
      return item;
    }).filter(item => {
      // Remove items with 0 available stock
      const available = stockMap[item.product_id] || 0;
      return available > 0;
    }));

    // For parsed items, we just filter them
    setParsedItems(prev => prev.map(item => {
      if (!item.valid || !item.product_id) return item;
      const available = stockMap[item.product_id] || 0;
      if (item.quantity > available) {
        return { ...item, quantity: Math.max(1, available) };
      }
      return item;
    }).filter(item => {
      if (!item.valid || !item.product_id) return true;
      const available = stockMap[item.product_id] || 0;
      return available > 0;
    }));

    setShowValidationDialog(false);
    toast.success('Quantidades ajustadas para o stock disponível');
  };

  // Handle confirming only items with available stock
  const handleConfirmPartial = () => {
    // Get only items that have stock
    const validItems = allItems.filter(item => {
      const available = stockMap[item.product_id] || 0;
      return item.quantity <= available;
    });

    if (validItems.length === 0) {
      toast.error('Nenhum item tem stock suficiente');
      setShowValidationDialog(false);
      return;
    }

    setShowValidationDialog(false);
    showPickingReportWithItems(validItems);
  };

  // Final confirmation after picking report
  const handleFinalConfirm = async () => {
    if (detailedPickingItems.length === 0) return;

    // Create picking session with location details
    // NOTA: O picking JÁ É uma saída - não criar stock_movement duplicado
    const pickingSessionItems = detailedPickingItems.flatMap(item => {
      // Get the first coli with location data for the session record
      const firstColi = item.colisDetails.find(c => c.location) || item.colisDetails[0];
      
      return {
        product_id: item.product_id,
        product_code: item.product_code,
        product_name: item.product_name,
        quantity: item.quantity,
        location: firstColi?.location || undefined,
        pallet_number: firstColi?.pallet_number || undefined,
        requires_forklift: item.hasForkliftRequired,
        level_name: firstColi?.level_name || undefined,
        aisle_name: firstColi?.aisle_name || undefined,
      };
    });

    // Criar sessão de picking (que já regista a saída como 'picking' no histórico)
    await createSession.mutateAsync({
      reference: reference || undefined,
      reason: reason || undefined,
      notes: notes || undefined,
      items: pickingSessionItems,
    });

    // Actualizar o stock na tabela counts para TODOS os colis do produto
    // Não criar stock_movement - o picking_items já serve como auditoria
    for (const item of detailedPickingItems) {
      const product = products.find(p => p.id === item.product_id);
      const totalColis = product?.total_colis || 1;

      // Encontrar item original no carrinho para verificar modo set/individual
      const cartItem = allItems.find(ci => ci.product_id === item.product_id);
      const isCompleteSet = cartItem?.isCompleteSet !== false;

      // Decrementar colis do produto
      for (let colisNumber = 1; colisNumber <= totalColis; colisNumber++) {
        // Determinar quantidade a decrementar para este colis
        const colisQty = isCompleteSet 
          ? item.quantity 
          : (cartItem?.colisQuantities?.[colisNumber] || 0);

        // Só processar se há quantidade a remover
        if (colisQty <= 0) continue;

        const { data: existingCount } = await supabase
          .from('counts')
          .select('id, quantity')
          .eq('product_id', item.product_id)
          .eq('colis_number', colisNumber)
          .order('counted_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingCount) {
          const currentQty = existingCount.quantity || 0;
          const newQty = Math.max(0, currentQty - colisQty);

          await supabase
            .from('counts')
            .update({ quantity: newQty, updated_at: new Date().toISOString() })
            .eq('id', existingCount.id);
        }
      }
    }

    // Invalidar queries para atualizar UI
    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({ queryKey: ['counts'] });

    toast.success(`${detailedPickingItems.length} saídas registadas com sucesso.`);

    // Reset form
    setParsedItems([]);
    setCart([]);
    setReason('');
    setReference('');
    setNotes('');
    setShowPickingReport(false);
    setItemsForPicking([]);
  };

  const handleClearAll = () => {
    setParsedItems([]);
    setCart([]);
  };

  return (
    <>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="saidas" className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4" />
            Saídas
          </TabsTrigger>
          <TabsTrigger value="historico" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Histórico de Picking
          </TabsTrigger>
        </TabsList>

        <TabsContent value="saidas" className="space-y-6">
          {/* Header */}
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-red-600" />
              Saídas de Stock
            </h2>
            <p className="text-sm text-muted-foreground">
              Registe saídas de produtos do inventário
            </p>
          </div>

          {/* Main Content - Stacked Layout for better product visibility */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Left/Main Column - Manual Selection (takes 2 cols on xl) */}
            <div className="xl:col-span-2 space-y-4">
              <ManualStockSection
                cart={cart}
                onAddToCart={handleAddToCart}
                onUpdateQuantity={handleUpdateQuantity}
                onRemoveFromCart={handleRemoveFromCart}
                movementType="saida"
              />

              {/* Collapsible Upload Section */}
              <details className="group">
                <summary className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors py-2">
                  <Upload className="h-4 w-4" />
                  <span>Importar de ficheiro CSV/Excel</span>
                  <span className="text-xs">(clique para expandir)</span>
                </summary>
                <div className="mt-2 space-y-4">
                  <StockUploadSection
                    onFileParsed={setParsedItems}
                    parseFile={parseStockFile}
                    isProcessing={isProcessing}
                    movementType="saida"
                  />
                  {parsedItems.length > 0 && (
                    <ParsedItemsPreview
                      items={parsedItems}
                      onClear={() => setParsedItems([])}
                    />
                  )}
                </div>
              </details>
            </div>

            {/* Right Column - Confirmation */}
            <div className="space-y-4">
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <div className="space-y-2">
                    <Label>Motivo</Label>
                    <Select value={reason} onValueChange={setReason}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um motivo..." />
                      </SelectTrigger>
                      <SelectContent>
                        {EXIT_REASONS.map((r) => (
                          <SelectItem key={r} value={r}>
                            {r}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Referência (opcional)</Label>
                    <Input
                      placeholder="Ex: FAT-2024-001, Pedido #123..."
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Notas (opcional)</Label>
                    <Input
                      placeholder="Observações adicionais..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>

                  <div className="pt-4 border-t space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total de itens:</span>
                      <span className="font-medium">{allItems.length} produtos</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total de unidades:</span>
                      <span className="font-medium">
                        {allItems.reduce((sum, i) => sum + i.quantity, 0)} un.
                      </span>
                    </div>

                    {hasStockErrors && (
                      <div className="flex items-center gap-2 p-2 rounded-md bg-destructive/10 text-destructive text-sm">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        <span>{stockErrors.length} produto(s) com stock insuficiente</span>
                      </div>
                    )}

                    {colisValidationMessage && (
                      <div className="flex items-start gap-2 p-2 rounded-md bg-orange-100 text-orange-800 text-sm">
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium">Stock por colis insuficiente</p>
                          <p className="text-xs mt-1">{colisValidationMessage}</p>
                          <p className="text-xs mt-1 text-orange-600">
                            Sugestão: Ajuste a quantidade ou mude para modo "Colis Individual".
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={handleClearAll}
                        disabled={allItems.length === 0}
                      >
                        Limpar
                      </Button>
                      <Button
                        variant="destructive"
                        className="flex-1 gap-2"
                        onClick={handleValidateAndConfirm}
                        disabled={allItems.length === 0 || createSession.isPending}
                      >
                        <ClipboardList className="h-4 w-4" />
                        {createSession.isPending ? 'A registar...' : 'Ver Picking'}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* History */}
          <StockHistoryTable
            movements={movements}
            isLoading={isLoading}
            onDelete={(m) => deleteMovement.mutate(m)}
            movementType="saida"
          />
        </TabsContent>

        <TabsContent value="historico">
          <PickingHistoryView />
        </TabsContent>
      </Tabs>

      {/* Validation Dialog */}
      <StockValidationDialog
        open={showValidationDialog}
        onOpenChange={setShowValidationDialog}
        errors={validationErrors}
        onAdjustQuantities={handleAdjustQuantities}
        onConfirmPartial={handleConfirmPartial}
      />

      {/* Picking Report Dialog */}
      <PickingReportDialog
        open={showPickingReport}
        onOpenChange={(open) => {
          setShowPickingReport(open);
          if (!open) setItemsForPicking([]);
        }}
        items={detailedPickingItems}
        reference={reference}
        reason={reason}
        notes={notes}
        onConfirm={handleFinalConfirm}
        isLoading={createSession.isPending || isLoadingPickingData}
      />
    </>
  );
}
