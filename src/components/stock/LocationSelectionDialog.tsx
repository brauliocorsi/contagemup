import { useState, useEffect } from 'react';
import { MapPin, Box, AlertTriangle, Check, Package, AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface LocationEntry {
  countId: string;
  quantity: number;
  location: string | null;
  pallet_number: string | null;
}

interface ColisLocationData {
  colisNumber: number;
  colisName?: string | null;
  entries: LocationEntry[];
}

interface LocationSelection {
  colisNumber: number;
  countId: string;
  quantityToDeduct: number;
}

interface LocationSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productName: string;
  productCode: string;
  quantitySets: number;
  totalColis: number;
  colisData: ColisLocationData[];
  onConfirm: (selections: LocationSelection[]) => void;
}

export function LocationSelectionDialog({
  open,
  onOpenChange,
  productName,
  productCode,
  quantitySets,
  totalColis,
  colisData,
  onConfirm,
}: LocationSelectionDialogProps) {
  // State: for each colis, track which locations are selected and how many units
  const [selections, setSelections] = useState<Record<number, { countId: string; quantity: number }[]>>({});

  // Initialize selections when dialog opens
  useEffect(() => {
    if (open) {
      const initial: Record<number, { countId: string; quantity: number }[]> = {};
      
      colisData.forEach(colis => {
        // Auto-select if only one location with enough stock
        const validEntries = colis.entries.filter(e => e.quantity > 0);
        
        if (validEntries.length === 1 && validEntries[0].quantity >= quantitySets) {
          // Single location with enough stock - auto-select
          initial[colis.colisNumber] = [{
            countId: validEntries[0].countId,
            quantity: quantitySets
          }];
        } else if (validEntries.length > 0) {
          // Multiple locations or insufficient single - user must choose
          initial[colis.colisNumber] = [];
        }
      });
      
      setSelections(initial);
    }
  }, [open, colisData, quantitySets]);

  const handleSelectLocation = (colisNumber: number, entry: LocationEntry) => {
    setSelections(prev => {
      const currentSelections = prev[colisNumber] || [];
      const existingIndex = currentSelections.findIndex(s => s.countId === entry.countId);
      
      if (existingIndex >= 0) {
        // Already selected - remove it
        return {
          ...prev,
          [colisNumber]: currentSelections.filter(s => s.countId !== entry.countId)
        };
      } else {
        // Add selection with default quantity
        const alreadySelected = currentSelections.reduce((sum, s) => sum + s.quantity, 0);
        const remaining = Math.max(0, quantitySets - alreadySelected);
        const toSelect = Math.min(remaining, entry.quantity);
        
        return {
          ...prev,
          [colisNumber]: [...currentSelections, { countId: entry.countId, quantity: toSelect }]
        };
      }
    });
  };

  const handleQuantityChange = (colisNumber: number, countId: string, newQuantity: number) => {
    setSelections(prev => {
      const currentSelections = prev[colisNumber] || [];
      return {
        ...prev,
        [colisNumber]: currentSelections.map(s => 
          s.countId === countId 
            ? { ...s, quantity: Math.max(0, newQuantity) }
            : s
        )
      };
    });
  };

  // Validate that all colis have sufficient selections
  const getValidationStatus = () => {
    const issues: string[] = [];
    
    colisData.forEach(colis => {
      const colisSelections = selections[colis.colisNumber] || [];
      const totalSelected = colisSelections.reduce((sum, s) => sum + s.quantity, 0);
      
      if (totalSelected < quantitySets) {
        const missing = quantitySets - totalSelected;
        issues.push(`Coli ${colis.colisNumber}: faltam ${missing} unidade${missing > 1 ? 's' : ''}`);
      }
    });
    
    return issues;
  };

  const validationIssues = getValidationStatus();
  const isValid = validationIssues.length === 0;

  const handleConfirm = () => {
    const allSelections: LocationSelection[] = [];
    
    Object.entries(selections).forEach(([colisNumStr, colisSelections]) => {
      colisSelections.forEach(sel => {
        if (sel.quantity > 0) {
          allSelections.push({
            colisNumber: parseInt(colisNumStr),
            countId: sel.countId,
            quantityToDeduct: sel.quantity
          });
        }
      });
    });
    
    onConfirm(allSelections);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-destructive" />
            Seleccionar Localizações para Saída
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium">{productCode}</span> - {productName}
            <br />
            Seleccione de onde retirar <span className="font-semibold text-foreground">{quantitySets} set{quantitySets > 1 ? 's' : ''}</span> de cada coli.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          <div className="space-y-4">
            {colisData.map(colis => {
              const colisSelections = selections[colis.colisNumber] || [];
              const totalSelected = colisSelections.reduce((sum, s) => sum + s.quantity, 0);
              const isColisComplete = totalSelected >= quantitySets;
              
              return (
                <div 
                  key={colis.colisNumber} 
                  className={cn(
                    "rounded-xl border-2 overflow-hidden transition-colors",
                    isColisComplete 
                      ? "border-green-300" 
                      : "border-amber-300"
                  )}
                >
                  {/* Coli Header */}
                  <div className={cn(
                    "px-4 py-3 flex items-center justify-between",
                    isColisComplete 
                      ? "bg-green-50" 
                      : "bg-amber-50"
                  )}>
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "h-10 w-10 rounded-full flex items-center justify-center",
                        isColisComplete 
                          ? "bg-green-100" 
                          : "bg-amber-100"
                      )}>
                        <Package className={cn(
                          "h-5 w-5",
                          isColisComplete 
                            ? "text-green-600" 
                            : "text-amber-600"
                        )} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-lg">
                            Coli {colis.colisNumber}
                          </span>
                          <span className="text-muted-foreground">
                            de {totalColis}
                          </span>
                        </div>
                        {colis.colisName && (
                          <span className="text-sm text-muted-foreground">
                            {colis.colisName}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {/* Progress Badge */}
                    <Badge 
                      className={cn(
                        "text-sm px-3 py-1.5 font-semibold",
                        isColisComplete 
                          ? "bg-green-600 hover:bg-green-600" 
                          : "bg-amber-500 hover:bg-amber-500"
                      )}
                    >
                      {isColisComplete ? (
                        <><Check className="h-4 w-4 mr-1.5" /> {totalSelected}/{quantitySets}</>
                      ) : (
                        <><AlertCircle className="h-4 w-4 mr-1.5" /> {totalSelected}/{quantitySets}</>
                      )}
                    </Badge>
                  </div>
                  
                  {/* Location Entries */}
                  <div className="p-3 bg-background">
                    <ScrollArea className="max-h-[200px]">
                    <div className="space-y-2 pr-2">
                    {colis.entries.filter(e => e.quantity > 0).map((entry) => {
                      const isSelected = colisSelections.some(s => s.countId === entry.countId);
                      const selection = colisSelections.find(s => s.countId === entry.countId);
                      
                      return (
                        <div 
                          key={entry.countId}
                          className={cn(
                            "p-4 rounded-lg border-2 cursor-pointer transition-all",
                            isSelected 
                              ? "border-primary bg-primary/5 shadow-sm" 
                              : "border-border hover:border-muted-foreground/50 hover:bg-muted/30"
                          )}
                          onClick={() => handleSelectLocation(colis.colisNumber, entry)}
                        >
                          <div className="flex items-center justify-between gap-4">
                            {/* Location Info */}
                            <div className="flex items-center gap-4 flex-1 min-w-0">
                              {/* Location Icon */}
                              <div className={cn(
                                "h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0",
                                entry.location ? "bg-blue-100" : "bg-muted"
                              )}>
                                <MapPin className={cn(
                                  "h-5 w-5",
                                  entry.location ? "text-blue-600" : "text-muted-foreground"
                                )} />
                              </div>
                              
                              {/* Details */}
                              <div className="space-y-0.5 min-w-0">
                                <div className="font-medium text-base">
                                  {entry.location || 'Sem localização'}
                                </div>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  {entry.pallet_number ? (
                                    <span className="flex items-center gap-1">
                                      <Box className="h-3.5 w-3.5" />
                                      {entry.pallet_number}
                                    </span>
                                  ) : (
                                    <span className="italic text-muted-foreground/70">Sem palete</span>
                                  )}
                                </div>
                              </div>
                            </div>
                            
                            {/* Quantity & Input */}
                            <div className="flex items-center gap-3 flex-shrink-0">
                              <Badge variant="secondary" className="text-sm px-2.5 py-1">
                                {entry.quantity} disponível
                              </Badge>
                              
                              {isSelected && (
                                <div 
                                  className="flex items-center gap-2 bg-background rounded-md border px-2 py-1"
                                  onClick={e => e.stopPropagation()}
                                >
                                  <Label className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                                    Retirar:
                                  </Label>
                                  <Input
                                    type="number"
                                    min="1"
                                    max={entry.quantity}
                                    value={selection?.quantity || 0}
                                    onChange={(e) => handleQuantityChange(
                                      colis.colisNumber, 
                                      entry.countId, 
                                      parseInt(e.target.value) || 0
                                    )}
                                    className="h-8 w-16 text-center font-semibold"
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    </div>
                    </ScrollArea>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {validationIssues.length > 0 && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-medium">Selecção incompleta:</p>
              <ul className="list-disc list-inside">
                {validationIssues.map((issue, i) => (
                  <li key={i}>{issue}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleConfirm}
            disabled={!isValid}
            className="bg-destructive hover:bg-destructive/90"
          >
            Confirmar Saída
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type { LocationSelection, ColisLocationData, LocationEntry };
