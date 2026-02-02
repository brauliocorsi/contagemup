import { useState, useCallback } from 'react';
import { TrendingUp, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useStockMovements, MovementItem, ParsedCSVItem } from '@/hooks/useStockMovements';
import { useProducts } from '@/hooks/useProducts';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { StockUploadSection, ParsedItemsPreview } from './StockUploadSection';
import { ManualStockSection } from './ManualStockSection';
import { StockHistoryTable } from './StockHistoryTable';
import { EntryLocationDialog, ExistingLocation, EntryDestination } from './EntryLocationDialog';

const ENTRY_REASONS = [
  'Compra',
  'Devolução de cliente',
  'Transferência',
  'Ajuste de inventário',
  'Produção',
  'Outro',
];

export function StockEntriesView() {
  const queryClient = useQueryClient();
  const {
    movements,
    isLoading,
    isProcessing,
    registerBulkMovements,
    parseStockFile,
    deleteMovement,
  } = useStockMovements('entrada');

  const { products } = useProducts();

  const [parsedItems, setParsedItems] = useState<ParsedCSVItem[]>([]);
  const [cart, setCart] = useState<MovementItem[]>([]);
  const [reason, setReason] = useState<string>('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Entry location dialog state
  const [showEntryLocationDialog, setShowEntryLocationDialog] = useState(false);
  const [entryLocationItem, setEntryLocationItem] = useState<{
    item: MovementItem;
    existingLocations: ExistingLocation[];
  } | null>(null);
  const [pendingEntryDestinations, setPendingEntryDestinations] = useState<Map<string, EntryDestination>>(new Map());

  // Combine CSV items and manual cart
  const allItems: MovementItem[] = [
    ...parsedItems
      .filter(i => i.valid && i.product_id)
      .map(i => ({
        product_id: i.product_id!,
        product_code: i.code,
        product_name: i.product_name || '',
        quantity: i.quantity,
      })),
    ...cart,
  ];

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

  // Check if items need location selection (products with multiple existing locations)
  const checkForMultipleLocations = async (items: MovementItem[]): Promise<Array<{
    item: MovementItem;
    existingLocations: ExistingLocation[];
  }>> => {
    const itemsNeedingSelection: Array<{
      item: MovementItem;
      existingLocations: ExistingLocation[];
    }> = [];

    for (const item of items) {
      // Skip items that already have destination selected
      if (pendingEntryDestinations.has(item.product_id)) continue;

      // Fetch counts with locations for this product
      const { data: counts } = await supabase
        .from('counts')
        .select('location, pallet_number, quantity')
        .eq('product_id', item.product_id)
        .gt('quantity', 0);

      if (!counts || counts.length === 0) continue;

      // Get unique locations
      const locationMap = new Map<string, ExistingLocation>();
      counts.forEach(c => {
        if (!c.location) return;
        const key = `${c.location}|${c.pallet_number || ''}`;
        const existing = locationMap.get(key);
        if (existing) {
          existing.quantity += c.quantity;
        } else {
          locationMap.set(key, {
            location: c.location,
            pallet: c.pallet_number,
            quantity: c.quantity,
          });
        }
      });

      const uniqueLocations = Array.from(locationMap.values());
      
      // If product has multiple locations, ask where to add
      if (uniqueLocations.length > 1) {
        itemsNeedingSelection.push({
          item,
          existingLocations: uniqueLocations,
        });
      }
    }

    return itemsNeedingSelection;
  };

  // Handle entry location selection
  const handleEntryLocationConfirm = async (destination: EntryDestination) => {
    if (!entryLocationItem) return;

    // Store destination for this product
    setPendingEntryDestinations(prev => {
      const newMap = new Map(prev);
      newMap.set(entryLocationItem.item.product_id, destination);
      return newMap;
    });

    setShowEntryLocationDialog(false);
    setEntryLocationItem(null);

    // Check if there are more items needing selection
    const remainingItems = await checkForMultipleLocations(allItems);
    if (remainingItems.length > 0) {
      const nextItem = remainingItems[0];
      setEntryLocationItem(nextItem);
      setShowEntryLocationDialog(true);
    } else {
      // All selections done, proceed with confirmation
      await executeEntries();
    }
  };

  const handleConfirm = async () => {
    if (allItems.length === 0) return;
    
    // Check if any items need location selection
    const itemsNeedingSelection = await checkForMultipleLocations(allItems);
    if (itemsNeedingSelection.length > 0) {
      const firstItem = itemsNeedingSelection[0];
      setEntryLocationItem(firstItem);
      setShowEntryLocationDialog(true);
      return;
    }

    // No location selection needed, proceed directly
    await executeEntries();
  };

  const executeEntries = async () => {
    setIsSubmitting(true);

    try {
      // 1. Registar em stock_movements para auditoria
      await registerBulkMovements.mutateAsync({
        items: allItems,
        type: 'entrada',
        reason: reason || undefined,
        reference: reference || undefined,
        notes: notes || undefined,
      });

      // 2. Atualizar counts para TODOS os colis de cada produto
      for (const item of allItems) {
        const product = products.find(p => p.id === item.product_id);
        const totalColis = product?.total_colis || 1;

        // Check if we have a specific destination for this product
        const destination = pendingEntryDestinations.get(item.product_id);
        const targetLocation = destination?.location || product?.location || null;
        const targetPallet = destination?.pallet || product?.pallet_number || null;

        // Atualizar cada colis do produto
        for (let colisNumber = 1; colisNumber <= totalColis; colisNumber++) {
          // Determinar quantidade para este colis
          const colisQty = item.isCompleteSet !== false 
            ? item.quantity 
            : (item.colisQuantities?.[colisNumber] || 0);

          // Só processar se há quantidade a adicionar
          if (colisQty <= 0) continue;

          // Buscar count existente para este colis NA LOCALIZAÇÃO ESPECÍFICA
          const { data: existingCount } = await supabase
            .from('counts')
            .select('id, quantity')
            .eq('product_id', item.product_id)
            .eq('colis_number', colisNumber)
            .eq('location', targetLocation || '')
            .order('counted_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          const currentQty = existingCount?.quantity || 0;
          const newQty = currentQty + colisQty;

          if (existingCount) {
            // Atualizar count existente
            await supabase
              .from('counts')
              .update({ quantity: newQty, updated_at: new Date().toISOString() })
              .eq('id', existingCount.id);
          } else {
            // Criar novo count com localização específica
            await supabase.from('counts').insert({
              product_id: item.product_id,
              colis_number: colisNumber,
              quantity: colisQty,
              session_id: null, // Movimento administrativo
              location: targetLocation,
              pallet_number: targetPallet,
            });
          }
        }
      }

      // 3. Invalidar queries para atualizar UI
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['counts'] });

      toast.success(`${allItems.length} entrada(s) registada(s) com sucesso.`);

      // Reset form
      setParsedItems([]);
      setCart([]);
      setReason('');
      setReference('');
      setNotes('');
      setPendingEntryDestinations(new Map());
    } catch (error) {
      console.error('Erro ao registar entradas:', error);
      toast.error('Erro ao registar entradas');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearAll = () => {
    setParsedItems([]);
    setCart([]);
  };

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-green-600" />
            Entradas de Stock
          </h2>
          <p className="text-sm text-muted-foreground">
            Registe entradas de produtos no inventário
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
              movementType="entrada"
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
                  movementType="entrada"
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
                      {ENTRY_REASONS.map((r) => (
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
                    placeholder="Ex: PO-2024-001, Nota fiscal..."
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
                      className="flex-1 bg-green-600 hover:bg-green-700"
                      onClick={handleConfirm}
                      disabled={allItems.length === 0 || isSubmitting}
                    >
                      {isSubmitting ? 'A registar...' : 'Confirmar Entradas'}
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
          movementType="entrada"
        />
      </div>

      {/* Entry Location Dialog */}
      {entryLocationItem && (
        <EntryLocationDialog
          open={showEntryLocationDialog}
          onOpenChange={(open) => {
            setShowEntryLocationDialog(open);
            if (!open) setEntryLocationItem(null);
          }}
          productName={entryLocationItem.item.product_name}
          productCode={entryLocationItem.item.product_code}
          quantity={entryLocationItem.item.quantity}
          existingLocations={entryLocationItem.existingLocations}
          onConfirm={handleEntryLocationConfirm}
        />
      )}
    </>
  );
}
