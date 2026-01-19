import { useState, useCallback } from 'react';
import { TrendingDown } from 'lucide-react';
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
import { StockUploadSection, ParsedItemsPreview } from './StockUploadSection';
import { ManualStockSection } from './ManualStockSection';
import { StockHistoryTable } from './StockHistoryTable';

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
  const {
    movements,
    isLoading,
    isProcessing,
    registerBulkMovements,
    parseStockFile,
    deleteMovement,
  } = useStockMovements('saida');

  const [parsedItems, setParsedItems] = useState<ParsedCSVItem[]>([]);
  const [cart, setCart] = useState<MovementItem[]>([]);
  const [reason, setReason] = useState<string>('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');

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

  const handleConfirm = async () => {
    if (allItems.length === 0) return;

    await registerBulkMovements.mutateAsync({
      items: allItems,
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
  };

  const handleClearAll = () => {
    setParsedItems([]);
    setCart([]);
  };

  return (
    <div className="space-y-6">
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
                    className="flex-1"
                    onClick={handleConfirm}
                    disabled={allItems.length === 0 || registerBulkMovements.isPending}
                  >
                    {registerBulkMovements.isPending ? 'A registar...' : 'Confirmar Saídas'}
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
    </div>
  );
}
