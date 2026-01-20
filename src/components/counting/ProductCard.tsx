import { useState } from 'react';
import { ProductWithCounts } from '@/types/stock';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Plus, Minus, Package, CheckCircle2, AlertCircle, MapPin, Box, Hash, Pencil, History, Clock, ChevronDown, ChevronUp, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProductHistoryPopover } from './ProductHistoryPopover';
import { CountHistoryPopover } from './CountHistoryPopover';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ProductCardProps {
  product: ProductWithCounts;
  onIncrement: (productId: string, colisNumber: number) => void;
  onDecrement: (productId: string, colisNumber: number) => void;
  onLocationChange?: (productId: string, location: string) => void;
  onPalletChange?: (productId: string, palletNumber: string) => void;
  onColisLocationChange?: (productId: string, colisNumber: number, location: string) => void;
  onColisPalletChange?: (productId: string, colisNumber: number, palletNumber: string) => void;
  onAddColi?: (productId: string, newTotalColis: number) => void;
  onRemoveColi?: (productId: string, newTotalColis: number) => void;
  onCodeChange?: (productId: string, newCode: string) => Promise<boolean>;
  colisNames?: Record<string, string> | null;
  sessionId?: string;
}

export function ProductCard({ 
  product, 
  onIncrement, 
  onDecrement, 
  onLocationChange, 
  onPalletChange, 
  onColisLocationChange,
  onColisPalletChange,
  onAddColi,
  onRemoveColi,
  onCodeChange,
  colisNames,
  sessionId
}: ProductCardProps) {
  const [localLocation, setLocalLocation] = useState(product.location || '');
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [localPallet, setLocalPallet] = useState(product.palletNumber || '');
  const [isEditingPallet, setIsEditingPallet] = useState(false);
  const [localCode, setLocalCode] = useState(product.code);
  const [isEditingCode, setIsEditingCode] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [expandedColis, setExpandedColis] = useState<Set<number>>(new Set());
  const [colisLocations, setColisLocations] = useState<Record<number, string>>({});
  const [colisPallets, setColisPallets] = useState<Record<number, string>>({});
  const [editingColisLocation, setEditingColisLocation] = useState<number | null>(null);
  const [editingColisPallet, setEditingColisPallet] = useState<number | null>(null);

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

  const getColisLocation = (colisNumber: number): string | null => {
    const detail = product.colisDetails.find(c => c.colis_number === colisNumber);
    return detail?.location || null;
  };

  const getColisPallet = (colisNumber: number): string | null => {
    const detail = product.colisDetails.find(c => c.colis_number === colisNumber);
    return detail?.pallet_number || null;
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

  const toggleColisExpanded = (colisNum: number) => {
    setExpandedColis(prev => {
      const next = new Set(prev);
      if (next.has(colisNum)) {
        next.delete(colisNum);
      } else {
        next.add(colisNum);
      }
      return next;
    });
  };

  const handleColisLocationBlur = (colisNum: number) => {
    setEditingColisLocation(null);
    const newLocation = colisLocations[colisNum]?.trim() || '';
    const currentLocation = getColisLocation(colisNum) || '';
    if (newLocation !== currentLocation && onColisLocationChange) {
      onColisLocationChange(product.id, colisNum, newLocation);
    }
  };

  const handleColisLocationKeyDown = (e: React.KeyboardEvent, colisNum: number) => {
    if (e.key === 'Enter') {
      handleColisLocationBlur(colisNum);
    } else if (e.key === 'Escape') {
      setEditingColisLocation(null);
      setColisLocations(prev => ({ ...prev, [colisNum]: getColisLocation(colisNum) || '' }));
    }
  };

  const handleColisPalletBlur = (colisNum: number) => {
    setEditingColisPallet(null);
    const newPallet = colisPallets[colisNum]?.trim() || '';
    const currentPallet = getColisPallet(colisNum) || '';
    if (newPallet !== currentPallet && onColisPalletChange) {
      onColisPalletChange(product.id, colisNum, newPallet);
    }
  };

  const handleColisPalletKeyDown = (e: React.KeyboardEvent, colisNum: number) => {
    if (e.key === 'Enter') {
      handleColisPalletBlur(colisNum);
    } else if (e.key === 'Escape') {
      setEditingColisPallet(null);
      setColisPallets(prev => ({ ...prev, [colisNum]: getColisPallet(colisNum) || '' }));
    }
  };

  const startEditingColisLocation = (colisNum: number) => {
    setColisLocations(prev => ({ ...prev, [colisNum]: getColisLocation(colisNum) || '' }));
    setEditingColisLocation(colisNum);
  };

  const startEditingColisPallet = (colisNum: number) => {
    setColisPallets(prev => ({ ...prev, [colisNum]: getColisPallet(colisNum) || '' }));
    setEditingColisPallet(colisNum);
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

  // Determine if coli has different location/pallet than primary
  const hasLocationDifferent = (colisNum: number): boolean => {
    const colisLoc = getColisLocation(colisNum);
    if (!colisLoc && !product.location) return false;
    if (!colisLoc) return true;
    return colisLoc !== product.location;
  };

  const hasPalletDifferent = (colisNum: number): boolean => {
    const colisPal = getColisPallet(colisNum);
    if (!colisPal && !product.palletNumber) return false;
    if (!colisPal) return true;
    return colisPal !== product.palletNumber;
  };

  // Format locations summary
  const getLocationsSummary = (): string => {
    if (product.uniqueLocations.length === 0) return 'Sem localização';
    if (product.uniqueLocations.length === 1) return product.uniqueLocations[0];
    return `${product.uniqueLocations.length} localizações`;
  };

  const getPalletsSummary = (): string => {
    if (product.uniquePallets.length === 0) return 'Sem palete';
    if (product.uniquePallets.length === 1) return product.uniquePallets[0];
    return `${product.uniquePallets.length} paletes`;
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
                    <button className="p-0.5 rounded hover:bg-muted transition-colors" title="Histórico de alterações">
                      <History className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                    </button>
                  </ProductHistoryPopover>
                  <CountHistoryPopover productId={product.id} sessionId={sessionId}>
                    <button className="p-0.5 rounded hover:bg-muted transition-colors" title="Histórico de contagens">
                      <Clock className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                    </button>
                  </CountHistoryPopover>
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
          
          {/* Global Location field with indicator */}
          <div className="mt-2 flex items-center gap-2">
            <MapPin className={cn(
              "h-4 w-4 flex-shrink-0",
              product.hasMultipleLocations ? "text-orange-500" : "text-muted-foreground"
            )} />
            {isEditingLocation ? (
              <Input
                value={localLocation}
                onChange={(e) => setLocalLocation(e.target.value)}
                onBlur={handleLocationBlur}
                onKeyDown={handleLocationKeyDown}
                placeholder="Localização padrão..."
                className="h-8 text-sm"
                autoFocus
              />
            ) : (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setIsEditingLocation(true)}
                      className={cn(
                        "flex-1 text-left text-sm px-2 py-1 rounded border border-dashed flex items-center gap-1",
                        product.hasMultipleLocations 
                          ? "border-orange-300 bg-orange-50 text-orange-700" 
                          : product.location 
                            ? "border-primary/30 bg-primary/5 text-foreground" 
                            : "border-muted-foreground/30 text-muted-foreground hover:border-primary/50"
                      )}
                    >
                      <span className="truncate">{getLocationsSummary()}</span>
                      {product.hasMultipleLocations && (
                        <AlertCircle className="h-3 w-3 flex-shrink-0" />
                      )}
                    </button>
                  </TooltipTrigger>
                  {product.hasMultipleLocations && (
                    <TooltipContent>
                      <p className="font-medium mb-1">Localizações:</p>
                      {product.uniqueLocations.map((loc, i) => (
                        <p key={i} className="text-sm">{loc}</p>
                      ))}
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            )}
            {onLocationChange && product.hasMultipleLocations && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => {
                        if (localLocation && onLocationChange) {
                          onLocationChange(product.id, localLocation);
                        }
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Aplicar a todos os colis</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>

          {/* Global Pallet number field with indicator */}
          <div className="mt-2 flex items-center gap-2">
            <Box className={cn(
              "h-4 w-4 flex-shrink-0",
              product.hasMultiplePallets ? "text-orange-500" : "text-muted-foreground"
            )} />
            {isEditingPallet ? (
              <Input
                value={localPallet}
                onChange={(e) => setLocalPallet(e.target.value)}
                onBlur={handlePalletBlur}
                onKeyDown={handlePalletKeyDown}
                placeholder="Nº palete padrão..."
                className="h-8 text-sm"
                autoFocus
              />
            ) : (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setIsEditingPallet(true)}
                      className={cn(
                        "flex-1 text-left text-sm px-2 py-1 rounded border border-dashed flex items-center gap-1",
                        product.hasMultiplePallets 
                          ? "border-orange-300 bg-orange-50 text-orange-700" 
                          : product.palletNumber 
                            ? "border-primary/30 bg-primary/5 text-foreground" 
                            : "border-muted-foreground/30 text-muted-foreground hover:border-primary/50"
                      )}
                    >
                      <span className="truncate">{getPalletsSummary()}</span>
                      {product.hasMultiplePallets && (
                        <AlertCircle className="h-3 w-3 flex-shrink-0" />
                      )}
                    </button>
                  </TooltipTrigger>
                  {product.hasMultiplePallets && (
                    <TooltipContent>
                      <p className="font-medium mb-1">Paletes:</p>
                      {product.uniquePallets.map((p, i) => (
                        <p key={i} className="text-sm">{p}</p>
                      ))}
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            )}
            {onPalletChange && product.hasMultiplePallets && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => {
                        if (localPallet && onPalletChange) {
                          onPalletChange(product.id, localPallet);
                        }
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Aplicar a todos os colis</TooltipContent>
                </Tooltip>
              </TooltipProvider>
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
              const isExpanded = expandedColis.has(colisNum);
              const colisLocation = getColisLocation(colisNum);
              const colisPallet = getColisPallet(colisNum);
              const locDiff = hasLocationDifferent(colisNum);
              const palDiff = hasPalletDifferent(colisNum);
              const hasDetails = colisLocation || colisPallet || locDiff || palDiff;
              
              return (
                <div
                  key={colisNum}
                  className={cn(
                    'rounded-lg border',
                    isMissing && 'border-yellow-300 bg-yellow-100',
                    isExcess && !isMissing && 'border-green-300 bg-green-100',
                    !isMissing && !isExcess && 'bg-muted/30'
                  )}
                >
                  {/* Main coli row */}
                  <div className="flex items-center justify-between p-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <button
                        onClick={() => toggleColisExpanded(colisNum)}
                        className="p-0.5 rounded hover:bg-muted/50 transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>
                      <div className="flex flex-col flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="font-medium text-sm">
                            Coli {colisNum}/{product.total_colis}
                          </span>
                          {colisName && (
                            <span className="text-muted-foreground text-xs truncate">
                              - {colisName}
                            </span>
                          )}
                          {(locDiff || palDiff) && !isExpanded && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <AlertCircle className="h-3 w-3 text-orange-500" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  {locDiff && <p>📍 {colisLocation || 'Sem localização'}</p>}
                                  {palDiff && <p>📦 {colisPallet || 'Sem palete'}</p>}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
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

                  {/* Expanded details for per-coli location/pallet */}
                  {isExpanded && (
                    <div className="px-2 pb-2 pt-0 border-t border-dashed space-y-1.5">
                      {/* Per-coli location */}
                      <div className="flex items-center gap-1.5">
                        <MapPin className={cn(
                          "h-3 w-3 flex-shrink-0",
                          locDiff ? "text-orange-500" : "text-muted-foreground"
                        )} />
                        {editingColisLocation === colisNum ? (
                          <Input
                            value={colisLocations[colisNum] || ''}
                            onChange={(e) => setColisLocations(prev => ({ ...prev, [colisNum]: e.target.value }))}
                            onBlur={() => handleColisLocationBlur(colisNum)}
                            onKeyDown={(e) => handleColisLocationKeyDown(e, colisNum)}
                            placeholder="Localização..."
                            className="h-6 text-xs py-0"
                            autoFocus
                          />
                        ) : (
                          <button
                            onClick={() => startEditingColisLocation(colisNum)}
                            className={cn(
                              "flex-1 text-left text-xs px-1.5 py-0.5 rounded border border-dashed truncate",
                              locDiff
                                ? "border-orange-300 bg-orange-50 text-orange-700"
                                : colisLocation
                                  ? "border-primary/30 bg-primary/5"
                                  : "border-muted-foreground/20 text-muted-foreground"
                            )}
                          >
                            {colisLocation || 'Localização...'}
                          </button>
                        )}
                      </div>

                      {/* Per-coli pallet */}
                      <div className="flex items-center gap-1.5">
                        <Box className={cn(
                          "h-3 w-3 flex-shrink-0",
                          palDiff ? "text-orange-500" : "text-muted-foreground"
                        )} />
                        {editingColisPallet === colisNum ? (
                          <Input
                            value={colisPallets[colisNum] || ''}
                            onChange={(e) => setColisPallets(prev => ({ ...prev, [colisNum]: e.target.value }))}
                            onBlur={() => handleColisPalletBlur(colisNum)}
                            onKeyDown={(e) => handleColisPalletKeyDown(e, colisNum)}
                            placeholder="Nº palete..."
                            className="h-6 text-xs py-0"
                            autoFocus
                          />
                        ) : (
                          <button
                            onClick={() => startEditingColisPallet(colisNum)}
                            className={cn(
                              "flex-1 text-left text-xs px-1.5 py-0.5 rounded border border-dashed truncate",
                              palDiff
                                ? "border-orange-300 bg-orange-50 text-orange-700"
                                : colisPallet
                                  ? "border-primary/30 bg-primary/5"
                                  : "border-muted-foreground/20 text-muted-foreground"
                            )}
                          >
                            {colisPallet || 'Nº palete...'}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
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
