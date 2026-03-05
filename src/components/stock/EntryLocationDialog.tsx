import { useState, useEffect } from 'react';
import { MapPin, Box, Plus, CheckCircle2, Package, Sparkles } from 'lucide-react';
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
import { Switch } from '@/components/ui/switch';
import { PalletSelect } from '@/components/counting/PalletSelect';
import { LocationSelect } from '@/components/counting/LocationSelect';
import { cn } from '@/lib/utils';

interface ExistingLocation {
  location: string;
  pallet: string | null;
  quantity: number;
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
  onConfirm: (destinations: Map<number, EntryDestination>) => void;
  totalColis?: number;
  colisNames?: Record<string, string> | null;
}

// Per-coli destination state
interface PerColiState {
  destinationType: 'existing' | 'new';
  selectedExisting: string;
  newLocation: string;
  newPallet: string;
}

function SingleDestinationForm({
  existingLocations,
  destinationType,
  setDestinationType,
  selectedExisting,
  setSelectedExisting,
  newLocation,
  setNewLocation,
  newPallet,
  handlePalletChange,
}: {
  existingLocations: ExistingLocation[];
  destinationType: 'existing' | 'new';
  setDestinationType: (v: 'existing' | 'new') => void;
  selectedExisting: string;
  setSelectedExisting: (v: string) => void;
  newLocation: string;
  setNewLocation: (v: string) => void;
  newPallet: string;
  handlePalletChange: (value: string, derivedLocation?: string) => void;
}) {
  return (
    <div className="space-y-4">
      {existingLocations.length > 0 && (
        <div className="space-y-3">
          {/* Suggestion banner */}
          <div className="flex items-center gap-2 p-2.5 rounded-md bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800">
            <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="text-sm text-amber-800 dark:text-amber-300">
              Este produto já existe no armazém. Sugerimos armazenar junto!
            </span>
          </div>

          <RadioGroup value={destinationType} onValueChange={(v) => setDestinationType(v as 'existing' | 'new')}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="existing" id="existing" />
              <Label htmlFor="existing" className="font-medium cursor-pointer">
                Juntar à localização existente
              </Label>
            </div>
          </RadioGroup>

          {destinationType === 'existing' && (
            <ExistingLocationList
              existingLocations={existingLocations}
              selectedExisting={selectedExisting}
              setSelectedExisting={setSelectedExisting}
            />
          )}
        </div>
      )}

      {existingLocations.length > 0 && (
        <div className="relative">
          <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">ou</span>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <RadioGroup value={destinationType} onValueChange={(v) => setDestinationType(v as 'existing' | 'new')}>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="new" id="new" />
            <Label htmlFor="new" className="font-medium cursor-pointer">
              Nova localização
            </Label>
          </div>
        </RadioGroup>

        {destinationType === 'new' && (
          <NewLocationForm
            newPallet={newPallet}
            handlePalletChange={handlePalletChange}
            newLocation={newLocation}
            setNewLocation={setNewLocation}
          />
        )}
      </div>
    </div>
  );
}

function ExistingLocationList({
  existingLocations,
  selectedExisting,
  setSelectedExisting,
}: {
  existingLocations: ExistingLocation[];
  selectedExisting: string;
  setSelectedExisting: (v: string) => void;
}) {
  // Sort by quantity descending - highest stock first (best suggestion)
  const sorted = [...existingLocations].sort((a, b) => b.quantity - a.quantity);
  const topKey = sorted.length > 0 ? `${sorted[0].location}|${sorted[0].pallet || ''}` : '';

  return (
    <ScrollArea className="max-h-[200px]">
      <div className="space-y-2 pr-2">
        {sorted.map((loc, idx) => {
          const key = `${loc.location}|${loc.pallet || ''}`;
          const isSelected = selectedExisting === key;
          const isRecommended = key === topKey;
          return (
            <div
              key={idx}
              className={cn(
                "p-4 rounded-lg border-2 cursor-pointer transition-all",
                isSelected
                  ? "border-primary bg-primary/5 shadow-sm"
                  : isRecommended
                    ? "border-amber-300 bg-amber-50/50 hover:border-amber-400 dark:border-amber-700 dark:bg-amber-950/20"
                    : "border-border hover:border-muted-foreground/50 hover:bg-muted/30"
              )}
              onClick={() => setSelectedExisting(key)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center", loc.location ? "bg-blue-100 dark:bg-blue-950" : "bg-muted")}>
                    <MapPin className={cn("h-5 w-5", loc.location ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground")} />
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-base">{loc.location}</span>
                      {isRecommended && (
                        <Badge className="bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-700 text-xs px-1.5 py-0">
                          <Sparkles className="h-3 w-3 mr-0.5" />
                          Sugerido
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      {loc.pallet ? (
                        <span className="flex items-center gap-1"><Box className="h-3.5 w-3.5" />{loc.pallet}</span>
                      ) : (
                        <span className="italic text-muted-foreground/70">Sem palete</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-sm px-2.5 py-1">{loc.quantity} un. actual</Badge>
                  {isSelected && <CheckCircle2 className="h-5 w-5 text-primary" />}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

function NewLocationForm({
  newPallet,
  handlePalletChange,
  newLocation,
  setNewLocation,
}: {
  newPallet: string;
  handlePalletChange: (value: string, derivedLocation?: string) => void;
  newLocation: string;
  setNewLocation: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 pl-6">
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Palete (opcional)</Label>
        <PalletSelect value={newPallet} onValueChange={handlePalletChange} placeholder="Seleccionar palete..." />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Localização <span className="text-destructive">*</span></Label>
        <LocationSelect value={newLocation} onValueChange={setNewLocation} placeholder="Seleccionar localização..." />
      </div>
    </div>
  );
}

function PerColiDestinationForm({
  colisNumber,
  colisName,
  existingLocations,
  state,
  onStateChange,
}: {
  colisNumber: number;
  colisName: string | null;
  existingLocations: ExistingLocation[];
  state: PerColiState;
  onStateChange: (s: PerColiState) => void;
}) {
  const handlePalletChange = (value: string, derivedLocation?: string) => {
    onStateChange({
      ...state,
      newPallet: value,
      newLocation: derivedLocation || state.newLocation,
    });
  };

  return (
    <div className="border rounded-lg p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="font-normal">
          <Package className="h-3 w-3 mr-1" />
          Coli {colisNumber}
        </Badge>
        {colisName && <span className="text-sm text-muted-foreground">{colisName}</span>}
      </div>

      <div className="space-y-2">
        {existingLocations.length > 0 && (
          <div className="space-y-2">
            <RadioGroup
              value={state.destinationType}
              onValueChange={(v) => onStateChange({ ...state, destinationType: v as 'existing' | 'new' })}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="existing" id={`existing-${colisNumber}`} />
                <Label htmlFor={`existing-${colisNumber}`} className="text-sm cursor-pointer">
                  Juntar à localização existente
                </Label>
                <Sparkles className="h-3 w-3 text-amber-500" />
              </div>
            </RadioGroup>
            {state.destinationType === 'existing' && (
              <div className="space-y-1 pl-6">
                {[...existingLocations].sort((a, b) => b.quantity - a.quantity).map((loc, idx) => {
                  const key = `${loc.location}|${loc.pallet || ''}`;
                  const isSelected = state.selectedExisting === key;
                  const isTop = idx === 0;
                  return (
                    <div
                      key={idx}
                      className={cn(
                        "p-2 rounded-md border cursor-pointer transition-all text-sm flex items-center justify-between",
                        isSelected ? "border-primary bg-primary/5" : isTop ? "border-amber-300 bg-amber-50/50 dark:border-amber-700 dark:bg-amber-950/20" : "border-border hover:border-muted-foreground/50"
                      )}
                      onClick={() => onStateChange({ ...state, selectedExisting: key })}
                    >
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{loc.location}</span>
                        {loc.pallet && <span className="text-muted-foreground">/ {loc.pallet}</span>}
                        {isTop && <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">Sugerido</span>}
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">{loc.quantity} un.</span>
                        {isSelected && <CheckCircle2 className="h-4 w-4 text-primary" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="space-y-2">
          <RadioGroup
            value={state.destinationType}
            onValueChange={(v) => onStateChange({ ...state, destinationType: v as 'existing' | 'new' })}
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="new" id={`new-${colisNumber}`} />
              <Label htmlFor={`new-${colisNumber}`} className="text-sm cursor-pointer">Nova localização</Label>
            </div>
          </RadioGroup>
          {state.destinationType === 'new' && (
            <div className="grid grid-cols-2 gap-2 pl-6">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Palete</Label>
                <PalletSelect value={state.newPallet} onValueChange={handlePalletChange} placeholder="Palete..." />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Localização *</Label>
                <LocationSelect value={state.newLocation} onValueChange={(v) => onStateChange({ ...state, newLocation: v })} placeholder="Localização..." />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function EntryLocationDialog({
  open,
  onOpenChange,
  productName,
  productCode,
  quantity,
  existingLocations,
  onConfirm,
  totalColis = 1,
  colisNames,
}: EntryLocationDialogProps) {
  const isMultiColi = totalColis > 1;

  // Single destination mode state
  const [destinationType, setDestinationType] = useState<'existing' | 'new'>('existing');
  const [selectedExisting, setSelectedExisting] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newPallet, setNewPallet] = useState('');

  // Per-coli mode
  const [perColiMode, setPerColiMode] = useState(false);
  const [perColiStates, setPerColiStates] = useState<Map<number, PerColiState>>(new Map());

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      if (existingLocations.length > 0) {
        setDestinationType('existing');
        const first = existingLocations[0];
        setSelectedExisting(`${first.location}|${first.pallet || ''}`);
      } else {
        setDestinationType('new');
      }
      setNewLocation('');
      setNewPallet('');
      setPerColiMode(false);

      // Initialize per-coli states
      const states = new Map<number, PerColiState>();
      for (let i = 1; i <= totalColis; i++) {
        const defaultState: PerColiState = {
          destinationType: existingLocations.length > 0 ? 'existing' : 'new',
          selectedExisting: existingLocations.length > 0 ? `${existingLocations[0].location}|${existingLocations[0].pallet || ''}` : '',
          newLocation: '',
          newPallet: '',
        };
        states.set(i, defaultState);
      }
      setPerColiStates(states);
    }
  }, [open, existingLocations, totalColis]);

  const handlePalletChange = (value: string, derivedLocation?: string) => {
    setNewPallet(value);
    if (derivedLocation) setNewLocation(derivedLocation);
  };

  const buildDestination = (dtype: 'existing' | 'new', selExisting: string, loc: string, pallet: string): EntryDestination | null => {
    if (dtype === 'existing') {
      if (!selExisting) return null;
      const [location, p] = selExisting.split('|');
      return { type: 'existing', location, pallet: p || null };
    } else {
      if (!loc) return null;
      return { type: 'new', location: loc, pallet: pallet || null };
    }
  };

  const isSingleValid = destinationType === 'existing' ? selectedExisting !== '' : newLocation !== '';

  const isPerColiValid = (): boolean => {
    for (let i = 1; i <= totalColis; i++) {
      const s = perColiStates.get(i);
      if (!s) return false;
      if (s.destinationType === 'existing' && !s.selectedExisting) return false;
      if (s.destinationType === 'new' && !s.newLocation) return false;
    }
    return true;
  };

  const isValid = perColiMode ? isPerColiValid() : isSingleValid;

  const handleConfirm = () => {
    if (!isValid) return;

    const destinations = new Map<number, EntryDestination>();

    if (perColiMode) {
      for (let i = 1; i <= totalColis; i++) {
        const s = perColiStates.get(i)!;
        const dest = buildDestination(s.destinationType, s.selectedExisting, s.newLocation, s.newPallet);
        if (dest) destinations.set(i, dest);
      }
    } else {
      const dest = buildDestination(destinationType, selectedExisting, newLocation, newPallet);
      if (dest) {
        for (let i = 1; i <= totalColis; i++) {
          destinations.set(i, dest);
        }
      }
    }

    onConfirm(destinations);
  };

  const updatePerColiState = (colisNumber: number, state: PerColiState) => {
    setPerColiStates(prev => {
      const next = new Map(prev);
      next.set(colisNumber, state);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
              <Plus className="h-5 w-5 text-green-600" />
            </div>
            <span>Destino da Entrada</span>
          </DialogTitle>
          <DialogDescription className="pt-2">
            <span className="font-medium">{productCode}</span> - {productName}
            <br />
            Seleccione onde armazenar <span className="font-semibold text-foreground">{quantity} set{quantity > 1 ? 's' : ''}</span>
            {isMultiColi && <span className="text-muted-foreground"> ({totalColis} colis)</span>}.
          </DialogDescription>
        </DialogHeader>

        {/* Per-coli toggle - only for multi-coli products */}
        {isMultiColi && (
          <div className="flex items-center justify-between py-2 px-3 bg-muted/50 rounded-md">
            <div className="flex items-center gap-2 text-sm">
              <Package className="h-4 w-4 text-muted-foreground" />
              <span>Destino diferente por coli</span>
            </div>
            <Switch checked={perColiMode} onCheckedChange={setPerColiMode} />
          </div>
        )}

        <ScrollArea className="flex-1 min-h-0">
          <div className="pr-2">
            {perColiMode ? (
              <div className="space-y-3">
                {Array.from({ length: totalColis }, (_, i) => i + 1).map(colisNumber => (
                  <PerColiDestinationForm
                    key={colisNumber}
                    colisNumber={colisNumber}
                    colisName={colisNames?.[String(colisNumber)] || null}
                    existingLocations={existingLocations}
                    state={perColiStates.get(colisNumber) || {
                      destinationType: 'new',
                      selectedExisting: '',
                      newLocation: '',
                      newPallet: '',
                    }}
                    onStateChange={(s) => updatePerColiState(colisNumber, s)}
                  />
                ))}
              </div>
            ) : (
              <SingleDestinationForm
                existingLocations={existingLocations}
                destinationType={destinationType}
                setDestinationType={setDestinationType}
                selectedExisting={selectedExisting}
                setSelectedExisting={setSelectedExisting}
                newLocation={newLocation}
                setNewLocation={setNewLocation}
                newPallet={newPallet}
                handlePalletChange={handlePalletChange}
              />
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={!isValid} className="bg-green-600 hover:bg-green-700">
            Confirmar Entrada
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type { ExistingLocation, EntryDestination };
