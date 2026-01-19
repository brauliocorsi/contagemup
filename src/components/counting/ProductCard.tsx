import { useState } from 'react';
import { ProductWithCounts } from '@/types/stock';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Plus, Minus, Package, CheckCircle2, AlertCircle, MapPin, Box, Hash, Pencil, History } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProductHistoryPopover } from './ProductHistoryPopover';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ProductCardProps {
  product: ProductWithCounts;
  onIncrement: (productId: string, colisNumber: number) => void;
  onDecrement: (productId: string, colisNumber: number) => void;
  onLocationChange?: (productId: string, location: string) => void;
  onPalletChange?: (productId: string, palletNumber: string) => void;
  onAddColi?: (productId: string, newTotalColis: number) => void;
  onRemoveColi?: (productId: string, newTotalColis: number) => void;
  onCodeChange?: (productId: string, newCode: string) => Promise<boolean>;
  colisNames?: Record<string, string> | null;
}

export function ProductCard({ 
  product, 
  onIncrement, 
  onDecrement, 
  onLocationChange, 
  onPalletChange, 
  onAddColi,
  onRemoveColi,
  onCodeChange,
  colisNames 
}: ProductCardProps) {
  const [localLocation, setLocalLocation] = useState(product.location || '');
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [localPallet, setLocalPallet] = useState(product.palletNumber || '');
  const [isEditingPallet, setIsEditingPallet] = useState(false);
  const [localCode, setLocalCode] = useState(product.code);
  const [isEditingCode, setIsEditingCode] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

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

  const getColisName = (colisNumber: number): string | null => {
    if (!colisNames) return null;
    return colisNames[colisNumber.toString()] || null;
  };

  // Format missing colis for display
  const getMissingDescription = () => {
    if (product.missingForNextComplete.length === 0) return null;
    
    const missingItems = product.missingForNextComplete.map(c => {
      const name = getColisName(c.colis_number);
      return name 
        ? `${c.missing}x ${name}` 
        : `${c.missing}x Coli ${c.colis_number}`;
    }).join(', ');
    
    return `Falta: ${missingItems}`;
  };

  const handleLocationBlur = () => {
    setIsEditingLocation(false);
    if (localLocation !== (product.location || '') && onLocationChange) {
      onLocationChange(product.id, localLocation);
    }
  };

  const handleLocationKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleLocationBlur();
    }
  };

  const handlePalletBlur = () => {
    setIsEditingPallet(false);
    if (localPallet !== (product.palletNumber || '') && onPalletChange) {
      onPalletChange(product.id, localPallet);
    }
  };

  const handlePalletKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handlePalletBlur();
    }
  };

  const handleCodeBlur = async () => {
    setIsEditingCode(false);
    const trimmedCode = localCode.trim();
    if (trimmedCode !== product.code && onCodeChange) {
      const success = await onCodeChange(product.id, trimmedCode);
      if (!success) {
        setLocalCode(product.code); // Revert on failure
      }
    } else if (!trimmedCode) {
      setLocalCode(product.code); // Revert if empty
    }
  };

  const handleCodeKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCodeBlur();
    } else if (e.key === 'Escape') {
      setLocalCode(product.code);
      setIsEditingCode(false);
    }
  };

  const lastColisQuantity = getColisQuantity(product.total_colis);

  const handleRemoveColisClick = () => {
    if (lastColisQuantity > 0) {
      setShowRemoveConfirm(true);
    } else {
      onRemoveColi?.(product.id, product.total_colis - 1);
    }
  };

  const confirmRemoveColi = () => {
    onRemoveColi?.(product.id, product.total_colis - 1);
    setShowRemoveConfirm(false);
  };

  return (
    <>
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
              <div className="flex-1 min-w-0">
                <CardTitle className="text-base">{product.name}</CardTitle>
                <div className="flex items-center gap-1 mt-0.5">
                  <Hash className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  {isEditingCode ? (
                    <Input
                      value={localCode}
                      onChange={(e) => setLocalCode(e.target.value)}
                      onBlur={handleCodeBlur}
                      onKeyDown={handleCodeKeyDown}
                      className="h-6 text-sm py-0 px-1 w-32"
                      autoFocus
                    />
                  ) : (
                    <button
                      onClick={() => setIsEditingCode(true)}
                      className="group flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <span>{product.code}</span>
                      <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  )}
                  <ProductHistoryPopover productId={product.id}>
                    <button className="p-0.5 rounded hover:bg-muted transition-colors" title="Ver histórico">
                      <History className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                    </button>
                  </ProductHistoryPopover>
                </div>
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
          
          {/* Location field */}
          <div className="mt-2 flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            {isEditingLocation ? (
              <Input
                value={localLocation}
                onChange={(e) => setLocalLocation(e.target.value)}
                onBlur={handleLocationBlur}
                onKeyDown={handleLocationKeyDown}
                placeholder="Onde está este produto?"
                className="h-8 text-sm"
                autoFocus
              />
            ) : (
              <button
                onClick={() => setIsEditingLocation(true)}
                className={cn(
                  "flex-1 text-left text-sm px-2 py-1 rounded border border-dashed",
                  product.location 
                    ? "border-primary/30 bg-primary/5 text-foreground" 
                    : "border-muted-foreground/30 text-muted-foreground hover:border-primary/50"
                )}
              >
                {product.location || 'Adicionar localização...'}
              </button>
            )}
          </div>

          {/* Pallet number field */}
          <div className="mt-2 flex items-center gap-2">
            <Box className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            {isEditingPallet ? (
              <Input
                value={localPallet}
                onChange={(e) => setLocalPallet(e.target.value)}
                onBlur={handlePalletBlur}
                onKeyDown={handlePalletKeyDown}
                placeholder="Nº da palete"
                className="h-8 text-sm"
                autoFocus
              />
            ) : (
              <button
                onClick={() => setIsEditingPallet(true)}
                className={cn(
                  "flex-1 text-left text-sm px-2 py-1 rounded border border-dashed",
                  product.palletNumber 
                    ? "border-primary/30 bg-primary/5 text-foreground" 
                    : "border-muted-foreground/30 text-muted-foreground hover:border-primary/50"
                )}
              >
                {product.palletNumber || 'Nº palete...'}
              </button>
            )}
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
              const colisName = getColisName(colisNum);
              
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
                      {colisName && (
                        <span className="text-muted-foreground font-normal ml-1">
                          - {colisName}
                        </span>
                      )}
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

          {/* Add/Remove colis buttons */}
          {(onAddColi || onRemoveColi) && (
            <div className="flex gap-2 mt-3 pt-3 border-t">
              {onRemoveColi && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                  disabled={product.total_colis <= 1}
                  onClick={handleRemoveColisClick}
                >
                  <Minus className="h-4 w-4 mr-1" />
                  Remover coli
                </Button>
              )}
              {onAddColi && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-green-600 hover:text-green-700 hover:bg-green-50"
                  onClick={() => onAddColi(product.id, product.total_colis + 1)}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Adicionar coli
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmation dialog for removing coli with counts */}
      <AlertDialog open={showRemoveConfirm} onOpenChange={setShowRemoveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Coli {product.total_colis}?</AlertDialogTitle>
            <AlertDialogDescription>
              Este coli tem {lastColisQuantity} unidade{lastColisQuantity > 1 ? 's' : ''} contada{lastColisQuantity > 1 ? 's' : ''}.
              Ao remover, as contagens serão eliminadas permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemoveColi} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}