import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Search, Check, X, MapPin, Package, AlertTriangle } from 'lucide-react';
import { OrderNumberEntry } from '@/types/stock';
import { cn } from '@/lib/utils';

interface OrderNumberInputProps {
  onVerify: (orderNumber: string) => Promise<OrderNumberEntry | null>;
  onSelect: (order: OrderNumberEntry) => void;
  existingOrders?: OrderNumberEntry[];
  placeholder?: string;
  disabled?: boolean;
  totalColis?: number;
}

export function OrderNumberInput({
  onVerify,
  onSelect,
  existingOrders = [],
  placeholder = "Número de encomenda",
  disabled = false,
  totalColis = 1
}: OrderNumberInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{
    found: boolean;
    order?: OrderNumberEntry;
    message?: string;
  } | null>(null);

  const handleVerify = async () => {
    if (!inputValue.trim()) return;

    setVerifying(true);
    setVerificationResult(null);

    try {
      const order = await onVerify(inputValue.trim());

      if (order) {
        if (order.is_complete) {
          setVerificationResult({
            found: true,
            order,
            message: 'Encontrado em stock!'
          });
        } else {
          // Count missing colis
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
          message: 'Número de encomenda não encontrado em stock'
        });
      }
    } catch (error) {
      console.error('Error verifying order:', error);
      setVerificationResult({
        found: false,
        message: 'Erro ao verificar número de encomenda'
      });
    } finally {
      setVerifying(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleVerify();
    }
  };

  const handleSelectVerified = () => {
    if (verificationResult?.order && verificationResult.order.is_complete) {
      onSelect(verificationResult.order);
      setInputValue('');
      setVerificationResult(null);
    }
  };

  const getColisStatusDisplay = (order: OrderNumberEntry) => {
    const items = [];
    for (let i = 1; i <= totalColis; i++) {
      const isPresent = order.colis_status[i.toString()];
      items.push(
        <span 
          key={i}
          className={cn(
            "inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded",
            isPresent ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
          )}
        >
          C{i}: {isPresent ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
        </span>
      );
    }
    return items;
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setVerificationResult(null);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || verifying}
          className="flex-1"
        />
        <Button
          type="button"
          variant="secondary"
          onClick={handleVerify}
          disabled={disabled || verifying || !inputValue.trim()}
        >
          <Search className="h-4 w-4 mr-2" />
          Verificar
        </Button>
      </div>

      {verificationResult && (
        <Card className={cn(
          "border-2",
          verificationResult.found && verificationResult.order?.is_complete
            ? "border-green-500 bg-green-50"
            : verificationResult.found
            ? "border-yellow-500 bg-yellow-50"
            : "border-red-500 bg-red-50"
        )}>
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center gap-2">
              {verificationResult.found && verificationResult.order?.is_complete ? (
                <Check className="h-5 w-5 text-green-600" />
              ) : verificationResult.found ? (
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
              ) : (
                <X className="h-5 w-5 text-red-600" />
              )}
              <span className={cn(
                "font-medium",
                verificationResult.found && verificationResult.order?.is_complete
                  ? "text-green-700"
                  : verificationResult.found
                  ? "text-yellow-700"
                  : "text-red-700"
              )}>
                {verificationResult.message}
              </span>
            </div>

            {verificationResult.order && (
              <>
                <div className="flex flex-wrap gap-2 text-sm">
                  {verificationResult.order.location && (
                    <Badge variant="outline" className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {verificationResult.order.location}
                    </Badge>
                  )}
                  {verificationResult.order.pallet_number && (
                    <Badge variant="outline" className="flex items-center gap-1">
                      <Package className="h-3 w-3" />
                      {verificationResult.order.pallet_number}
                    </Badge>
                  )}
                </div>

                {totalColis > 1 && (
                  <div className="flex flex-wrap gap-1">
                    {getColisStatusDisplay(verificationResult.order)}
                  </div>
                )}

                {verificationResult.order.is_complete && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSelectVerified}
                    className="w-full mt-2"
                  >
                    Adicionar ao carrinho de saída
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* List of available orders */}
      {existingOrders.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Encomendas em stock:</p>
          <div className="max-h-32 overflow-y-auto space-y-1">
            {existingOrders.map(order => (
              <div
                key={order.id}
                className={cn(
                  "flex items-center justify-between p-2 rounded text-sm cursor-pointer transition-colors",
                  order.is_complete 
                    ? "bg-green-50 hover:bg-green-100 border border-green-200" 
                    : "bg-yellow-50 hover:bg-yellow-100 border border-yellow-200"
                )}
                onClick={() => order.is_complete && onSelect(order)}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono font-medium">{order.order_number}</span>
                  {!order.is_complete && (
                    <Badge variant="outline" className="text-xs text-yellow-700 border-yellow-400">
                      Incompleta
                    </Badge>
                  )}
                </div>
                {order.location && (
                  <span className="text-muted-foreground text-xs">{order.location}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
