import { ProductWithCounts } from '@/types/stock';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Minus, Package, CheckCircle2, AlertCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProductCardProps {
  product: ProductWithCounts;
  onIncrement: (productId: string, colisNumber: number) => void;
  onDecrement: (productId: string, colisNumber: number) => void;
}

export function ProductCard({ product, onIncrement, onDecrement }: ProductCardProps) {
  const getStatusIcon = () => {
    switch (product.status) {
      case 'complete':
        return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      case 'incomplete':
        return <AlertCircle className="h-5 w-5 text-red-600" />;
      case 'excess':
        return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
      default:
        return <Package className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusBadge = () => {
    switch (product.status) {
      case 'complete':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">{product.completeSets} Completo(s)</Badge>;
      case 'incomplete':
        return <Badge variant="destructive">Incompleto</Badge>;
      case 'excess':
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Excesso</Badge>;
      default:
        return <Badge variant="secondary">Não contado</Badge>;
    }
  };

  const getColisQuantity = (colisNumber: number) => {
    const count = product.counts.find(c => c.colis_number === colisNumber);
    return count?.quantity || 0;
  };

  const isColisIncomplete = (colisNumber: number) => {
    return product.incompleteColis.some(c => c.colis_number === colisNumber);
  };

  const isColisExcess = (colisNumber: number) => {
    return product.excessColis.some(c => c.colis_number === colisNumber);
  };

  return (
    <Card className={cn(
      'transition-all',
      product.status === 'incomplete' && 'border-red-300 bg-red-50/50',
      product.status === 'complete' && 'border-green-300 bg-green-50/50',
      product.status === 'excess' && 'border-yellow-300 bg-yellow-50/50'
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
          {getStatusBadge()}
        </div>
        {product.incompleteColis.length > 0 && (
          <p className="text-sm text-red-600 mt-2">
            Falta: Colis {product.incompleteColis.map(c => c.colis_number).join(', ')}
          </p>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid gap-2">
          {Array.from({ length: product.total_colis }, (_, i) => i + 1).map((colisNum) => {
            const quantity = getColisQuantity(colisNum);
            const isIncomplete = isColisIncomplete(colisNum);
            const isExcess = isColisExcess(colisNum);
            
            return (
              <div
                key={colisNum}
                className={cn(
                  'flex items-center justify-between p-2 rounded-lg border',
                  isIncomplete && 'border-red-300 bg-red-100',
                  isExcess && 'border-yellow-300 bg-yellow-100',
                  !isIncomplete && !isExcess && 'bg-muted/30'
                )}
              >
                <span className="font-medium text-sm">
                  Colis {colisNum}/{product.total_colis}
                </span>
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
