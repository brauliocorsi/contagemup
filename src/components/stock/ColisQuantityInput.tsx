import { useState, useEffect } from 'react';
import { Package, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ColisQuantityInputProps {
  totalColis: number;
  quantity: number;
  isCompleteSet: boolean;
  colisQuantities: Record<number, number>;
  onQuantityChange: (quantity: number) => void;
  onModeChange: (isCompleteSet: boolean) => void;
  onColisQuantityChange: (colisNumber: number, quantity: number) => void;
  movementType: 'entrada' | 'saida';
  availableStockPerColi?: Record<number, number>;
}

export function ColisQuantityInput({
  totalColis,
  quantity,
  isCompleteSet,
  colisQuantities,
  onQuantityChange,
  onModeChange,
  onColisQuantityChange,
  movementType,
  availableStockPerColi,
}: ColisQuantityInputProps) {
  // Calculate total from individual colis quantities
  const individualTotal = Object.values(colisQuantities).reduce((sum, q) => sum + q, 0);
  
  // For sets, the preview shows quantity per each coli
  const setsPreview = Array.from({ length: totalColis }, (_, i) => ({
    colis: i + 1,
    quantity: quantity,
  }));

  // For individual mode, show actual quantities
  const individualPreview = Array.from({ length: totalColis }, (_, i) => ({
    colis: i + 1,
    quantity: colisQuantities[i + 1] || 0,
  }));

  // Calculate complete sets from individual quantities (minimum across all colis)
  const completeSetsFromIndividual = Math.min(
    ...Array.from({ length: totalColis }, (_, i) => colisQuantities[i + 1] || 0)
  );

  return (
    <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
      {/* Mode Toggle */}
      <div className="flex gap-2">
        <Button
          type="button"
          variant={isCompleteSet ? "default" : "outline"}
          size="sm"
          className="flex-1 gap-2"
          onClick={() => onModeChange(true)}
        >
          <Layers className="h-4 w-4" />
          Set Completo
        </Button>
        <Button
          type="button"
          variant={!isCompleteSet ? "default" : "outline"}
          size="sm"
          className="flex-1 gap-2"
          onClick={() => onModeChange(false)}
        >
          <Package className="h-4 w-4" />
          Colis Individual
        </Button>
      </div>

      {/* Set Completo Mode */}
      {isCompleteSet && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label className="text-sm">Quantidade de sets:</Label>
            <Input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => onQuantityChange(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-20 h-8 text-center"
            />
          </div>
          
          {/* Preview */}
          <div className="text-xs text-muted-foreground space-y-1">
            <div className="flex flex-wrap gap-1">
              {setsPreview.map(({ colis, quantity: qty }) => (
                <Badge key={colis} variant="secondary" className="text-xs">
                  Coli {colis}: {qty} un.
                </Badge>
              ))}
            </div>
            <p className="text-primary font-medium">
              {movementType === 'entrada' ? 'Sets a adicionar' : 'Sets a retirar'}: {quantity}
            </p>
          </div>
        </div>
      )}

      {/* Colis Individual Mode */}
      {!isCompleteSet && (
        <div className="space-y-2">
          <Label className="text-sm">Quantidade por coli:</Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Array.from({ length: totalColis }, (_, i) => {
              const colisNumber = i + 1;
              const qty = colisQuantities[colisNumber] || 0;
              const available = availableStockPerColi?.[colisNumber];
              const exceedsStock = movementType === 'saida' && available !== undefined && qty > available;
              
              return (
                <div key={colisNumber} className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground w-12">Coli {colisNumber}:</span>
                  <Input
                    type="number"
                    min="0"
                    value={qty}
                    onChange={(e) => onColisQuantityChange(colisNumber, Math.max(0, parseInt(e.target.value) || 0))}
                    className={cn(
                      "h-8 w-16 text-center text-sm",
                      exceedsStock && "border-destructive bg-destructive/10"
                    )}
                  />
                  {available !== undefined && (
                    <span className={cn(
                      "text-xs",
                      exceedsStock ? "text-destructive" : "text-muted-foreground"
                    )}>
                      /{available}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          
          {/* Summary */}
          <div className="text-xs text-muted-foreground pt-1 border-t">
            <p>
              Total de unidades: {individualTotal} • 
              Sets completos: <span className="text-primary font-medium">{completeSetsFromIndividual}</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
