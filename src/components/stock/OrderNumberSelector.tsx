import { useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Trash2, MapPin, Package, Check, X, ClipboardList } from 'lucide-react';
import { useOrderNumbers } from '@/hooks/useOrderNumbers';
import { OrderNumberEntry } from '@/types/stock';
import { cn } from '@/lib/utils';

interface OrderNumberExitSelectorProps {
  productId: string;
  productCode: string;
  productName: string;
  totalColis: number;
  onAddToCart: (orderEntry: OrderNumberEntry) => void;
}

export function OrderNumberExitSelector({
  productId,
  productCode,
  productName,
  totalColis,
  onAddToCart,
}: OrderNumberExitSelectorProps) {
  const { orderNumbers, loading, verifyOrderNumber } = useOrderNumbers(productId, totalColis);
  const [searchValue, setSearchValue] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{
    found: boolean;
    order?: OrderNumberEntry;
    message?: string;
  } | null>(null);

  const completeOrders = orderNumbers.filter(o => o.is_complete);
  const incompleteOrders = orderNumbers.filter(o => !o.is_complete);

  const handleVerify = async () => {
    if (!searchValue.trim()) return;
    
    setVerifying(true);
    setVerificationResult(null);

    const order = await verifyOrderNumber(searchValue.trim());
    
    if (order) {
      if (order.is_complete) {
        setVerificationResult({
          found: true,
          order,
          message: 'Encontrado em stock!'
        });
      } else {
        const missingColis: number[] = [];
        for (let i = 1; i <= totalColis; i++) {
          if (!order.colis_status[i.toString()]) {
            missingColis.push(i);
          }
        }
        setVerificationResult({
          found: true,
          order,
          message: `Encomenda incompleta (falta: ${missingColis.map(c => `Cóli ${c}`).join(', ')})`
        });
      }
    } else {
      setVerificationResult({
        found: false,
        message: 'Número de encomenda não encontrado'
      });
    }
    
    setVerifying(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleVerify();
    }
  };

  const handleSelect = (order: OrderNumberEntry) => {
    if (order.is_complete) {
      onAddToCart(order);
      setSearchValue('');
      setVerificationResult(null);
    }
  };

  const getColisStatusBadges = (order: OrderNumberEntry) => {
    return Array.from({ length: totalColis }, (_, i) => {
      const colisNum = i + 1;
      const isPresent = order.colis_status[colisNum.toString()];
      return (
        <span
          key={colisNum}
          className={cn(
            "inline-flex items-center gap-0.5 text-xs px-1 py-0.5 rounded",
            isPresent ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
          )}
        >
          C{colisNum}
          {isPresent ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
        </span>
      );
    });
  };

  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-amber-600" />
          Selecionar por Nº Encomenda
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {productCode} - {productName}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Search input */}
        <div className="flex gap-2">
          <Input
            value={searchValue}
            onChange={(e) => {
              setSearchValue(e.target.value);
              setVerificationResult(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Número de encomenda..."
            disabled={verifying}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleVerify}
            disabled={verifying || !searchValue.trim()}
          >
            Verificar
          </Button>
        </div>

        {/* Verification result */}
        {verificationResult && (
          <div className={cn(
            "p-2 rounded-lg border text-sm",
            verificationResult.found && verificationResult.order?.is_complete
              ? "bg-green-50 border-green-200 text-green-800"
              : verificationResult.found
              ? "bg-yellow-50 border-yellow-200 text-yellow-800"
              : "bg-red-50 border-red-200 text-red-800"
          )}>
            <div className="flex items-center justify-between">
              <span>{verificationResult.message}</span>
              {verificationResult.order?.is_complete && (
                <Button
                  size="sm"
                  onClick={() => handleSelect(verificationResult.order!)}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Adicionar
                </Button>
              )}
            </div>
            {verificationResult.order && (
              <div className="mt-2 space-y-1">
                {(verificationResult.order.location || verificationResult.order.pallet_number) && (
                  <div className="flex gap-2 text-xs">
                    {verificationResult.order.location && (
                      <Badge variant="outline" className="gap-1">
                        <MapPin className="h-2.5 w-2.5" />
                        {verificationResult.order.location}
                      </Badge>
                    )}
                    {verificationResult.order.pallet_number && (
                      <Badge variant="outline" className="gap-1">
                        <Package className="h-2.5 w-2.5" />
                        {verificationResult.order.pallet_number}
                      </Badge>
                    )}
                  </div>
                )}
                {totalColis > 1 && (
                  <div className="flex flex-wrap gap-1">
                    {getColisStatusBadges(verificationResult.order)}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Available orders list */}
        {!loading && completeOrders.length > 0 && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              Encomendas disponíveis ({completeOrders.length}):
            </Label>
            <ScrollArea className="h-[120px]">
              <div className="space-y-1">
                {completeOrders.map(order => (
                  <div
                    key={order.id}
                    className="flex items-center justify-between p-2 rounded bg-background border cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => handleSelect(order)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium">{order.order_number}</span>
                      {order.location && (
                        <Badge variant="outline" className="text-xs gap-1">
                          <MapPin className="h-2.5 w-2.5" />
                          {order.location}
                        </Badge>
                      )}
                    </div>
                    <Button size="sm" variant="ghost" className="h-6 px-2">
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Incomplete orders warning */}
        {!loading && incompleteOrders.length > 0 && (
          <div className="text-xs text-muted-foreground">
            <span className="text-yellow-600">{incompleteOrders.length}</span> encomenda(s) incompleta(s) não listada(s)
          </div>
        )}

        {loading && (
          <div className="text-sm text-muted-foreground text-center py-2">
            Carregando...
          </div>
        )}

        {!loading && orderNumbers.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-2">
            Nenhuma encomenda registada para este produto
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface OrderNumberEntrySelectorProps {
  productId: string;
  productCode: string;
  productName: string;
  totalColis: number;
  location?: string;
  palletNumber?: string;
  onOrderAdded: () => void;
}

export function OrderNumberEntrySelector({
  productId,
  productCode,
  productName,
  totalColis,
  location,
  palletNumber,
  onOrderAdded,
}: OrderNumberEntrySelectorProps) {
  const { orderNumbers, loading, addOrderNumber } = useOrderNumbers(productId, totalColis);
  const [newOrderNumber, setNewOrderNumber] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    if (!newOrderNumber.trim()) return;
    
    setAdding(true);
    const result = await addOrderNumber(newOrderNumber.trim(), location, palletNumber);
    setAdding(false);
    
    if (result) {
      setNewOrderNumber('');
      onOrderAdded();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <Card className="border-blue-200 bg-blue-50/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-blue-600" />
          Registar Nº Encomenda
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {productCode} - {productName}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Add new order number */}
        <div className="flex gap-2">
          <Input
            value={newOrderNumber}
            onChange={(e) => setNewOrderNumber(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Novo número de encomenda..."
            disabled={adding}
          />
          <Button
            type="button"
            size="sm"
            onClick={handleAdd}
            disabled={adding || !newOrderNumber.trim()}
          >
            <Plus className="h-3 w-3 mr-1" />
            Adicionar
          </Button>
        </div>

        {/* Existing orders */}
        {!loading && orderNumbers.length > 0 && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              Encomendas em stock ({orderNumbers.length}):
            </Label>
            <ScrollArea className="h-[100px]">
              <div className="space-y-1">
                {orderNumbers.map(order => (
                  <div
                    key={order.id}
                    className={cn(
                      "flex items-center justify-between p-2 rounded text-sm",
                      order.is_complete 
                        ? "bg-green-50 border border-green-200" 
                        : "bg-yellow-50 border border-yellow-200"
                    )}
                  >
                    <span className="font-mono">{order.order_number}</span>
                    {!order.is_complete && (
                      <Badge variant="outline" className="text-xs text-yellow-700">
                        Incompleta
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {loading && (
          <div className="text-sm text-muted-foreground text-center py-2">
            Carregando...
          </div>
        )}
      </CardContent>
    </Card>
  );
}

