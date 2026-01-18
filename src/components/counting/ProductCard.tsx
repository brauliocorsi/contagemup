import { ProductWithCounts } from '@/types/stock';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Minus, Package, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProductCardProps {
  product: ProductWithCounts;
  onIncrement: (productId: string, colisNumber: number) => void;
  onDecrement: (productId: string, colisNumber: number) => void;
}

export function ProductCard({ product, onIncrement, onDecrement }: ProductCardProps) {
  const getStatusIcon = () => {
    if (product.completeSets > 0) {
      return <CheckCircle2 className="h-5 w-5 text-green-600" />;
    }
    if (product.hasPartialProduct) {
      return <AlertCircle className="h-5 w-5 text-yellow-600" />;
    }
    return <Package className="h-5 w-5 text-muted-foreground" />;
  };

  const getColisQuantity = (colisNumber: number) => {
    const count = product.counts.find(c => c.colis_number === colisNumber);
    return count?.quantity || 0;
  };

  const isColisMissing = (colisNumber: number) => {
    return product.missingForNextComplete.some(c => c.colis_number === colisNumber);
  };

  const getMissingCount = (colisNumber: number) => {
    const missing = product.missingForNextComplete.find(c => c.colis_number === colisNumber);
    return missing?.missing || 0;
  };

  const isColisExcess = (colisNumber: number) => {
    return product.excessColis.some(c => c.colis_number === colisNumber);
  };

  // Format missing colis for display
  const getMissingDescription = () => {
    if (product.missingForNextComplete.length === 0) return null;
    
    const missingItems = product.missingForNextComplete.map(c => 
      `${c.missing}x Coli ${c.colis_number}`
    ).join(', ');
    
    return `Falta: ${missingItems}`;
  };

  return (
    <Card className={cn(
      'transition-all',
      product.hasPartialProduct && 'border-yellow-300 bg-yellow-50/50',
      !product.hasPartialProduct && product.completeSets > 0 && 'border-green-300 bg-green-50/50',
      product.status === 'not_counted' && 'border-muted'
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            <div>
              <CardTitle className="text-base">{product.name}</CardTitle>
              <p className="text-sm text-muted-foreground">{product.code}</p>
              <Badge variant="outline" className="mt-1 text-xs">{product.category}</Badge>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            {product.completeSets > 0 && (
              <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                {product.completeSets} Completo{product.completeSets > 1 ? 's' : ''}
              </Badge>
            )}
            {product.hasPartialProduct && (
              <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
                1 Incompleto
              </Badge>
            )}
            {product.status === 'not_counted' && (
              <Badge variant="secondary">Não contado</Badge>
            )}
          </div>
        </div>
        
        {/* Summary line showing complete + what's missing */}
        {(product.completeSets > 0 || product.hasPartialProduct) && (
          <div className="mt-2 p-2 rounded-md bg-muted/50 text-sm">
            <div className="flex items-center gap-2 flex-wrap">
              {product.completeSets > 0 && (
                <span className="text-green-700 font-medium">
                  ✓ {product.completeSets} produto{product.completeSets > 1 ? 's' : ''} completo{product.completeSets > 1 ? 's' : ''}
                </span>
              )}
              {product.hasPartialProduct && product.missingForNextComplete.length > 0 && (
                <>
                  {product.completeSets > 0 && <span className="text-muted-foreground">|</span>}
                  <span className="text-yellow-700">
                    Para +1: {getMissingDescription()}
                  </span>
                </>
              )}
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid gap-2">
          {Array.from({ length: product.total_colis }, (_, i) => i + 1).map((colisNum) => {
            const quantity = getColisQuantity(colisNum);
            const isMissing = isColisMissing(colisNum);
            const missingCount = getMissingCount(colisNum);
            const isExcess = isColisExcess(colisNum);
            
            return (
              <div
                key={colisNum}
                className={cn(
                  'flex items-center justify-between p-2 rounded-lg border',
                  isMissing && 'border-yellow-300 bg-yellow-100',
                  isExcess && !isMissing && 'border-green-300 bg-green-100',
                  !isMissing && !isExcess && 'bg-muted/30'
                )}
              >
                <div className="flex flex-col">
                  <span className="font-medium text-sm">
                    Coli {colisNum}/{product.total_colis}
                  </span>
                  {isMissing && (
                    <span className="text-xs text-yellow-700">
                      Falta {missingCount} unidade{missingCount > 1 ? 's' : ''}
                    </span>
                  )}
                  {isExcess && !isMissing && (
                    <span className="text-xs text-green-700">
                      OK
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onDecrement(product.id, colisNum)}
                    disabled={quantity === 0}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="w-8 text-center font-bold text-lg">{quantity}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onIncrement(product.id, colisNum)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
