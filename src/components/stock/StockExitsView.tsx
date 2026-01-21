import { useState, useCallback, useMemo } from 'react';
import { TrendingDown, History, AlertTriangle, ClipboardList } from 'lucide-react';
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
import { usePickingHistory, usePickingData, optimizePickingRoute } from '@/hooks/usePickingHistory';
import { useProducts } from '@/hooks/useProducts';
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

interface PickingItemWithLocation extends MovementItem {
  location?: string;
  pallet_number?: string;
  requires_forklift?: boolean;
  level_name?: string;
  aisle_name?: string;
  position_in_aisle?: number;
}

export function StockExitsView() {
  const {
    movements,
    isLoading,
    isProcessing,
    registerBulkMovements,
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
  
  // Picking report dialog state
  const [showPickingReport, setShowPickingReport] = useState(false);
  const [pickingItems, setPickingItems] = useState<PickingItemWithLocation[]>([]);

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

  // Fetch picking data for all items in cart
  const productIds = allItems.map(i => i.product_id);
  const { data: pickingData } = usePickingData(productIds);

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

  // Validate and show picking report
  const handleValidateAndConfirm = () => {
    if (allItems.length === 0) return;

    // Check for stock validation errors
    if (hasStockErrors) {
      setValidationErrors(stockErrors);
      setShowValidationDialog(true);
      return;
    }

    // All good, show picking report
    showPickingReportWithItems(allItems);
  };
  
  // Show picking report with prepared items
  const showPickingReportWithItems = (itemsToProcess: MovementItem[]) => {
    // Create picking session with location data
    const items = itemsToProcess.map(item => {
      const locations = pickingData?.[item.product_id] || [];
      const firstLocation = locations[0];
      
      return {
        product_id: item.product_id,
        product_code: item.product_code,
        product_name: item.product_name,
        quantity: item.quantity,
        location: firstLocation?.location || undefined,
        pallet_number: firstLocation?.pallet_number || undefined,
        requires_forklift: firstLocation?.requires_forklift ?? false,
        level_name: firstLocation?.level_name || undefined,
        aisle_name: firstLocation?.aisle_name || undefined,
        position_in_aisle: firstLocation?.position_in_aisle ?? 0,
      };
    });

    // Optimize the picking route
    const optimizedItems = optimizePickingRoute(items);
    setPickingItems(optimizedItems);
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
    if (pickingItems.length === 0) return;

    // Create picking session first
    await createSession.mutateAsync({
      reference: reference || undefined,
      reason: reason || undefined,
      notes: notes || undefined,
      items: pickingItems,
    });

    // Then register the stock movements
    const movementItems = pickingItems.map(item => ({
      product_id: item.product_id,
      product_code: item.product_code,
      product_name: item.product_name,
      quantity: item.quantity,
    }));

    await registerBulkMovements.mutateAsync({
      items: movementItems,
      type: 'saida',
      reason: reason || undefined,
      reference: reference || undefined,
      notes: notes || undefined,
    });

    // Reset form
    setParsedItems([]);
    setCart([]);
    setReason('');
    setReference('');
    setNotes('');
    setShowPickingReport(false);
    setPickingItems([]);
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

          {/* Main Content */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column - Input Methods */}
            <div className="space-y-4">
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

              <ManualStockSection
                cart={cart}
                onAddToCart={handleAddToCart}
                onUpdateQuantity={handleUpdateQuantity}
                onRemoveFromCart={handleRemoveFromCart}
                movementType="saida"
              />
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
                        disabled={allItems.length === 0 || registerBulkMovements.isPending || createSession.isPending}
                      >
                        <ClipboardList className="h-4 w-4" />
                        {(registerBulkMovements.isPending || createSession.isPending) ? 'A registar...' : 'Ver Picking'}
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
        onOpenChange={setShowPickingReport}
        items={pickingItems}
        reference={reference}
        reason={reason}
        notes={notes}
        onConfirm={handleFinalConfirm}
        isLoading={registerBulkMovements.isPending || createSession.isPending}
      />
    </>
  );
}
