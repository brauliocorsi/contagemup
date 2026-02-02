import { useState, useEffect } from 'react';
import { MapPin, Box, AlertTriangle, Check } from 'lucide-react';
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
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Seleccionar Localizações para Saída
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium">{productCode}</span> - {productName}
            <br />
            Este produto está dividido em múltiplas localizações. 
            Seleccione de onde retirar <span className="font-semibold">{quantitySets} set{quantitySets > 1 ? 's' : ''}</span>.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 max-h-[50vh]">
          <div className="space-y-4 pr-4">
            {colisData.map(colis => {
              const colisSelections = selections[colis.colisNumber] || [];
              const totalSelected = colisSelections.reduce((sum, s) => sum + s.quantity, 0);
              const isColisComplete = totalSelected >= quantitySets;
              
              return (
                <div key={colis.colisNumber} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2">
                      <span>Coli {colis.colisNumber}/{totalColis}</span>
                      {colis.colisName && (
                        <span className="text-muted-foreground">- {colis.colisName}</span>
                      )}
                    </Label>
                    <Badge 
                      variant={isColisComplete ? "default" : "secondary"}
                      className={cn(
                        isColisComplete && "bg-green-600"
                      )}
                    >
                      {isColisComplete ? (
                        <><Check className="h-3 w-3 mr-1" /> {totalSelected}/{quantitySets}</>
                      ) : (
                        `${totalSelected}/${quantitySets}`
                      )}
                    </Badge>
                  </div>
                  
                  <div className="space-y-1.5">
                    {colis.entries.filter(e => e.quantity > 0).map((entry) => {
                      const isSelected = colisSelections.some(s => s.countId === entry.countId);
                      const selection = colisSelections.find(s => s.countId === entry.countId);
                      
                      return (
                        <div 
                          key={entry.countId}
                          className={cn(
                            "p-3 rounded-lg border cursor-pointer transition-colors",
                            isSelected 
                              ? "border-primary bg-primary/5" 
                              : "hover:border-muted-foreground/50"
                          )}
                          onClick={() => handleSelectLocation(colis.colisNumber, entry)}
                        >
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <MapPin className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium">
                                  {entry.location || 'Sem localização'}
                                </span>
                              </div>
                              {entry.pallet_number && (
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                  <Box className="h-4 w-4" />
                                  <span>{entry.pallet_number}</span>
                                </div>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary">
                                {entry.quantity} disponível
                              </Badge>
                              
                              {isSelected && (
                                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                  <Label className="text-xs whitespace-nowrap">Retirar:</Label>
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
                                    className="h-8 w-16 text-center"
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

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
          >
            Confirmar Saída
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type { LocationSelection, ColisLocationData, LocationEntry };
