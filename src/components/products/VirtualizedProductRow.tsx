import { memo } from 'react';
import { Product } from '@/types/stock';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Trash2, Edit, MapPin, Box, History, ClipboardList, Eye, Split, AlertTriangle, CheckCircle, ArrowRightLeft } from 'lucide-react';
import { classifyLocation } from '@/lib/locationUtils';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { ProductSalesPopover } from './ProductSalesPopover';
import { VendaInfo } from '@/hooks/useProductSales';

interface LastCountData {
  totalQuantity: number;
  sessionName: string;
  countedAt: string;
  colisLocations: Array<{
    colisNumber: number;
    quantity: number;
    location: string | null;
    palletNumber: string | null;
  }>;
  uniqueLocations: string[];
  uniquePallets: string[];
  hasSplitColis: boolean;
  splitColisCount: number;
  splitEntries: Array<{
    colisNumber: number;
    entries: Array<{ location: string | null; quantity: number }>;
  }>;
}

interface OrderStats {
  order_count: number;
  total_pending_colis?: number;
}

interface VirtualizedProductRowProps {
  product: Product;
  lastCount?: LastCountData | null;
  isSelected: boolean;
  hasOrders: boolean;
  orderStats?: OrderStats | null;
  salesCount: number;
  sales: VendaInfo[];
  visibleColumns: Set<string>;
  columnWidths: Record<string, number>;
  onToggleSelection: (id: string) => void;
  onEdit: (product: Product) => void;
  onViewDetails: (product: Product) => void;
  onViewHistory: (product: Product) => void;
  onViewMovements: (product: Product) => void;
  onDelete: (id: string) => void;
}

const getStockStatus = (stock: number, minStock: number = 5) => {
  if (stock <= 0) return 'out_of_stock';
  if (stock <= minStock) return 'low_stock';
  return 'in_stock';
};

export const VirtualizedProductRow = memo(function VirtualizedProductRow({
  product,
  lastCount,
  isSelected,
  hasOrders,
  orderStats,
  visibleColumns,
  columnWidths,
  onToggleSelection,
  onEdit,
  onViewDetails,
  onViewHistory,
  onViewMovements,
  onDelete,
}: VirtualizedProductRowProps) {
  const isColumnVisible = (col: string) => visibleColumns.has(col);
  
  const getColWidth = (col: string) => {
    const w = columnWidths[col];
    return w ? { width: `${w}px`, minWidth: `${w}px`, maxWidth: `${w}px` } : {};
  };

  const status = getStockStatus(product.current_stock, product.min_stock);
  
  // Calculate incomplete units if we have distribution data
  let incompleteUnits = 0;
  let totalUnits = 0;
  const colisDistribution = lastCount?.colisLocations?.map(c => ({ colisNumber: c.colisNumber, quantity: c.quantity }));
  
  if (colisDistribution && colisDistribution.length > 0 && product.total_colis > 1) {
    totalUnits = colisDistribution.reduce((sum, c) => sum + c.quantity, 0);
    const unitsInCompleteSets = product.current_stock * product.total_colis;
    incompleteUnits = totalUnits - unitsInCompleteSets;
  }
  
  const hasIncomplete = incompleteUnits > 0;

  // Badge styles based on status
  let badgeClassName: string;
  let dotClassName: string;
  
  if (product.current_stock <= 0) {
    badgeClassName = "bg-slate-100 text-slate-500 border-slate-300";
    dotClassName = "bg-slate-400";
  } else if (status === 'low_stock') {
    badgeClassName = "bg-yellow-50 text-yellow-700 border-yellow-300";
    dotClassName = "bg-yellow-500";
  } else {
    badgeClassName = "bg-green-50 text-green-700 border-green-200";
    dotClassName = "bg-green-500";
  }

  return (
    <div 
      className={cn(
        "flex items-center border-b transition-colors hover:bg-muted/50",
        isSelected && "bg-primary/5"
      )}
      style={{ height: '60px' }}
    >
      {/* Checkbox */}
      <div className="flex-shrink-0 p-2" style={{ width: '48px' }}>
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleSelection(product.id)}
          aria-label={`Selecionar ${product.name}`}
        />
      </div>

      {/* Code */}
      {isColumnVisible('code') && (
        <div className="p-2 truncate font-mono text-sm" style={getColWidth('code')}>
          {product.code}
        </div>
      )}

      {/* Name */}
      {isColumnVisible('name') && (
        <div className="p-2 truncate font-medium text-sm" style={getColWidth('name')} title={product.name}>
          <div className="flex flex-col gap-0.5">
            <span className="truncate">{product.name}</span>
            {hasOrders && (
              <Badge variant="outline" className="text-[10px] w-fit bg-amber-50 text-amber-700 border-amber-300 gap-0.5">
                <ClipboardList className="h-2.5 w-2.5" />
                {orderStats?.order_count || 0} enc.
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* Category */}
      {isColumnVisible('category') && (
        <div className="p-2" style={getColWidth('category')}>
          <Badge variant="outline" className="text-xs">{product.category}</Badge>
        </div>
      )}

      {/* Colis */}
      {isColumnVisible('colis') && (
        <div className="p-2" style={getColWidth('colis')}>
          <Badge variant="secondary" className="text-xs">{product.total_colis}</Badge>
        </div>
      )}

      {/* Stock */}
      {isColumnVisible('stock') && (
        <div className="p-2" style={getColWidth('stock')}>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1">
              <Badge variant="outline" className={cn("gap-1 text-xs", badgeClassName)}>
                <span className={cn("w-1.5 h-1.5 rounded-full", dotClassName)} />
                {product.current_stock} {product.current_stock === 1 ? 'set' : 'sets'}
              </Badge>
              {hasIncomplete && (
                <Badge variant="outline" className="gap-0.5 px-1.5 py-0 h-5 bg-orange-50 text-orange-600 border-orange-300 text-[10px]">
                  +{incompleteUnits}
                </Badge>
              )}
            </div>
            {product.total_colis > 1 && (
              <span className="text-[10px] text-muted-foreground">({product.total_colis} colis/set)</span>
            )}
          </div>
        </div>
      )}

      {/* Damages */}
      {isColumnVisible('damages') && (
        <div className="p-2" style={getColWidth('damages')}>
          {(product.damaged_stock ?? 0) > 0 ? (
            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300 gap-1 text-xs">
              <AlertTriangle className="h-3 w-3" />
              {product.damaged_stock} un.
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1 text-xs">
              <CheckCircle className="h-3 w-3" />
              0
            </Badge>
          )}
        </div>
      )}

      {/* Total Units */}
      {isColumnVisible('totalUnits') && (
        <div className="p-2" style={getColWidth('totalUnits')}>
          <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 text-xs">
            {lastCount?.totalQuantity ?? 0} un.
          </Badge>
        </div>
      )}

      {/* Last Count */}
      {isColumnVisible('lastCount') && (
        <div className="p-2" style={getColWidth('lastCount')}>
          {lastCount ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex items-center gap-1 cursor-help">
                    <ClipboardList className="h-3 w-3 text-muted-foreground" />
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
                      {lastCount.totalQuantity} un.
                    </Badge>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="font-medium">{lastCount.sessionName}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(lastCount.countedAt), "dd MMM yyyy 'às' HH:mm", { locale: pt })}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <span className="text-muted-foreground text-sm">-</span>
          )}
        </div>
      )}

      {/* Colis Locations */}
      {isColumnVisible('colisLocations') && (
        <div className="p-2" style={getColWidth('colisLocations')}>
          {lastCount && lastCount.colisLocations.length > 0 ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex flex-wrap gap-0.5 max-w-[180px]">
                    {lastCount.hasSplitColis && (
                      <Badge variant="outline" className="text-xs flex items-center gap-1 bg-blue-50 text-blue-700 border-blue-300">
                        <Split className="h-2.5 w-2.5" />
                        {lastCount.splitColisCount} div.
                      </Badge>
                    )}
                    {lastCount.uniqueLocations.length > 0 ? (
                      lastCount.uniqueLocations.length === 1 ? (
                        <Badge variant="outline" className="text-xs flex items-center gap-1">
                          <MapPin className="h-2.5 w-2.5" />
                          {lastCount.uniqueLocations[0]}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs flex items-center gap-1 bg-orange-50 text-orange-700 border-orange-300">
                          <MapPin className="h-2.5 w-2.5" />
                          {lastCount.uniqueLocations.length} locais
                        </Badge>
                      )
                    ) : null}
                    {lastCount.uniquePallets.length > 0 && (
                      lastCount.uniquePallets.length === 1 ? (
                        <Badge variant="outline" className="text-xs flex items-center gap-1">
                          <Box className="h-2.5 w-2.5" />
                          {lastCount.uniquePallets[0]}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs flex items-center gap-1 bg-purple-50 text-purple-700 border-purple-300">
                          <Box className="h-2.5 w-2.5" />
                          {lastCount.uniquePallets.length} paletes
                        </Badge>
                      )
                    )}
                    {lastCount.uniqueLocations.length === 0 && lastCount.uniquePallets.length === 0 && !lastCount.hasSplitColis && (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-[400px]">
                  <p className="font-medium mb-2">Detalhes por Coli:</p>
                  <div className="space-y-1 text-xs">
                    {lastCount.colisLocations.map(c => {
                      const locInfo = classifyLocation(c.location);
                      const splitEntry = lastCount.splitEntries.find(s => s.colisNumber === c.colisNumber);
                      return (
                        <div key={c.colisNumber} className={cn(
                          "flex items-center gap-2 p-1 rounded",
                          splitEntry ? "bg-blue-50 border border-blue-200" : "bg-muted/50"
                        )}>
                          <span className="font-mono font-medium w-6">C{c.colisNumber}</span>
                          {splitEntry && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 bg-blue-100 text-blue-700 border-blue-300">
                              <Split className="h-2 w-2 mr-0.5" />
                              {splitEntry.entries.length}
                            </Badge>
                          )}
                          <span className="text-muted-foreground">→</span>
                          <div className="flex items-center gap-1 flex-1">
                            <MapPin className="h-2.5 w-2.5 text-muted-foreground" />
                            <span>{c.location || 'Sem local'}</span>
                            <Badge variant="outline" className={`text-[10px] px-1 py-0 ${locInfo.color}`}>
                              {locInfo.shortLabel}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1">
                            <Box className="h-2.5 w-2.5 text-muted-foreground" />
                            <span>{c.palletNumber || '-'}</span>
                          </div>
                          <Badge variant="secondary" className="text-[10px]">
                            {c.quantity}
                          </Badge>
                        </div>
                      );
                    })}
                    {lastCount.hasSplitColis && (
                      <p className="text-blue-600 mt-2 pt-2 border-t">
                        <Split className="h-3 w-3 inline mr-1" />
                        {lastCount.splitColisCount} coli(s) dividido(s) em múltiplas localizações
                      </p>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <span className="text-muted-foreground text-sm">-</span>
          )}
        </div>
      )}

      {/* Location */}
      {isColumnVisible('location') && (
        <div className="p-2 truncate" style={getColWidth('location')}>
          {product.location ? (
            <span className="flex items-center gap-1 text-muted-foreground text-sm">
              <MapPin className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{product.location}</span>
            </span>
          ) : '-'}
        </div>
      )}

      {/* Pallet */}
      {isColumnVisible('pallet') && (
        <div className="p-2 truncate" style={getColWidth('pallet')}>
          {product.pallet_number ? (
            <span className="flex items-center gap-1 text-muted-foreground text-sm">
              <Box className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{product.pallet_number}</span>
            </span>
          ) : '-'}
        </div>
      )}

      {/* Actions */}
      <div className="flex-shrink-0 flex items-center justify-end gap-1 px-2" style={{ width: '144px' }}>
        <Button 
          variant="ghost" 
          size="icon"
          onClick={() => onViewDetails(product)}
          title="Ver detalhes"
          className="h-8 w-8"
        >
          <Eye className="h-4 w-4" />
        </Button>
        <Button 
          variant="ghost" 
          size="icon"
          onClick={() => onViewMovements(product)}
          title="Ver movimentações"
          className="h-8 w-8"
        >
          <ArrowRightLeft className="h-4 w-4" />
        </Button>
        <Button 
          variant="ghost" 
          size="icon"
          onClick={() => onViewHistory(product)}
          title="Ver histórico de alterações"
          className="h-8 w-8"
        >
          <History className="h-4 w-4" />
        </Button>
        <Button 
          variant="ghost" 
          size="icon"
          onClick={() => onEdit(product)}
          title="Editar"
          className="h-8 w-8"
        >
          <Edit className="h-4 w-4" />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive h-8 w-8" title="Eliminar">
              <Trash2 className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminar produto?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação não pode ser revertida. O produto "{product.name}" será permanentemente eliminado.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => onDelete(product.id)}>
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
});
