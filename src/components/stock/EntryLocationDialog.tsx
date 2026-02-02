import { useState, useEffect } from 'react';
import { MapPin, Box, Plus, CheckCircle2, Package } from 'lucide-react';
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PalletSelect } from '@/components/counting/PalletSelect';
import { LocationSelect } from '@/components/counting/LocationSelect';
import { cn } from '@/lib/utils';

interface ExistingLocation {
  location: string;
  pallet: string | null;
  quantity: number; // Current quantity at this location
}

interface EntryDestination {
  type: 'existing' | 'new';
  location: string;
  pallet: string | null;
}

interface EntryLocationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productName: string;
  productCode: string;
  quantity: number;
  existingLocations: ExistingLocation[];
  onConfirm: (destination: EntryDestination) => void;
  // New props for multi-coli context
  totalColis?: number;
  currentColisNumber?: number;
  colisName?: string | null;
}

export function EntryLocationDialog({
  open,
  onOpenChange,
  productName,
  productCode,
  quantity,
  existingLocations,
  onConfirm,
  totalColis,
  currentColisNumber,
  colisName,
}: EntryLocationDialogProps) {
  const [destinationType, setDestinationType] = useState<'existing' | 'new'>('existing');
  const [selectedExisting, setSelectedExisting] = useState<string>('');
  const [newLocation, setNewLocation] = useState('');
  const [newPallet, setNewPallet] = useState('');

  const isMultiColi = totalColis && totalColis > 1;

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      // Default to existing if there are existing locations
      if (existingLocations.length > 0) {
        setDestinationType('existing');
        // Auto-select first location
        const first = existingLocations[0];
        setSelectedExisting(`${first.location}|${first.pallet || ''}`);
      } else {
        setDestinationType('new');
      }
      setNewLocation('');
      setNewPallet('');
    }
  }, [open, existingLocations]);

  const handlePalletChange = (value: string, derivedLocation?: string) => {
    setNewPallet(value);
    if (derivedLocation) {
      setNewLocation(derivedLocation);
    }
  };

  const isValid = destinationType === 'existing' 
    ? selectedExisting !== ''
    : newLocation !== '';

  const handleConfirm = () => {
    if (!isValid) return;

    if (destinationType === 'existing') {
      const [location, pallet] = selectedExisting.split('|');
      onConfirm({
        type: 'existing',
        location,
        pallet: pallet || null,
      });
    } else {
      onConfirm({
        type: 'new',
        location: newLocation,
        pallet: newPallet || null,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
              <Plus className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <span>Destino da Entrada</span>
              {isMultiColi && (
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="font-normal">
                    <Package className="h-3 w-3 mr-1" />
                    Coli {currentColisNumber} de {totalColis}
                  </Badge>
                  {colisName && (
                    <span className="text-sm font-normal text-muted-foreground">
                      {colisName}
                    </span>
                  )}
                </div>
              )}
            </div>
          </DialogTitle>
          <DialogDescription className="pt-2">
            <span className="font-medium">{productCode}</span> - {productName}
            <br />
            Seleccione onde armazenar <span className="font-semibold text-foreground">{quantity} set{quantity > 1 ? 's' : ''}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Option: Existing Location */}
          {existingLocations.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <RadioGroup 
                  value={destinationType} 
                  onValueChange={(v) => setDestinationType(v as 'existing' | 'new')}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="existing" id="existing" />
                    <Label htmlFor="existing" className="font-medium cursor-pointer">
                      Adicionar a localização existente
                    </Label>
                  </div>
                </RadioGroup>
              </div>
              
              {destinationType === 'existing' && (
                <ScrollArea className="max-h-[200px]">
                  <div className="space-y-2 pr-2">
                    {existingLocations.map((loc, idx) => {
                      const key = `${loc.location}|${loc.pallet || ''}`;
                      const isSelected = selectedExisting === key;
                      
                      return (
                        <div
                          key={idx}
                          className={cn(
                            "p-4 rounded-lg border-2 cursor-pointer transition-all",
                            isSelected 
                              ? "border-primary bg-primary/5 shadow-sm" 
                              : "border-border hover:border-muted-foreground/50 hover:bg-muted/30"
                          )}
                          onClick={() => setSelectedExisting(key)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              {/* Location Icon */}
                              <div className={cn(
                                "h-10 w-10 rounded-lg flex items-center justify-center",
                                loc.location ? "bg-blue-100" : "bg-muted"
                              )}>
                                <MapPin className={cn(
                                  "h-5 w-5",
                                  loc.location ? "text-blue-600" : "text-muted-foreground"
                                )} />
                              </div>
                              
                              {/* Details */}
                              <div className="space-y-0.5">
                                <div className="font-medium text-base">
                                  {loc.location}
                                </div>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  {loc.pallet ? (
                                    <span className="flex items-center gap-1">
                                      <Box className="h-3.5 w-3.5" />
                                      {loc.pallet}
                                    </span>
                                  ) : (
                                    <span className="italic text-muted-foreground/70">Sem palete</span>
                                  )}
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-sm px-2.5 py-1">
                                {loc.quantity} un. actual
                              </Badge>
                              {isSelected && (
                                <CheckCircle2 className="h-5 w-5 text-primary" />
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </div>
          )}

          {/* Separator */}
          {existingLocations.length > 0 && (
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">ou</span>
              </div>
            </div>
          )}

          {/* Option: New Location */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <RadioGroup 
                value={destinationType} 
                onValueChange={(v) => setDestinationType(v as 'existing' | 'new')}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="new" id="new" />
                  <Label htmlFor="new" className="font-medium cursor-pointer">
                    Nova localização
                  </Label>
                </div>
              </RadioGroup>
            </div>
            
            {destinationType === 'new' && (
              <div className="grid grid-cols-2 gap-3 pl-6">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Palete (opcional)
                  </Label>
                  <PalletSelect
                    value={newPallet}
                    onValueChange={handlePalletChange}
                    placeholder="Seleccionar palete..."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Localização <span className="text-destructive">*</span>
                  </Label>
                  <LocationSelect
                    value={newLocation}
                    onValueChange={setNewLocation}
                    placeholder="Seleccionar localização..."
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleConfirm}
            disabled={!isValid}
            className="bg-green-600 hover:bg-green-700"
          >
            Confirmar Entrada
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type { ExistingLocation, EntryDestination };
