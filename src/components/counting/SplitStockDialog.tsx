import { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, MapPin, Box, AlertCircle, CheckCircle2 } from 'lucide-react';
import { ColisDetail, StockDistribution } from '@/types/stock';
import { cn } from '@/lib/utils';
import { LocationSelect } from './LocationSelect';
import { PalletSelect } from './PalletSelect';

interface SplitStockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  colisNumber: number;
  colisName?: string | null;
  colisDetail: ColisDetail;
  onSave: (distributions: StockDistribution[]) => Promise<boolean>;
}

export function SplitStockDialog({
  open,
  onOpenChange,
  colisNumber,
  colisName,
  colisDetail,
  onSave
}: SplitStockDialogProps) {
  const [distributions, setDistributions] = useState<StockDistribution[]>([]);
  const [saving, setSaving] = useState(false);

  // Initialize distributions from existing data
  useEffect(() => {
    if (open) {
      if (colisDetail.locationEntries.length > 0) {
        // Use existing entries
        setDistributions(
          colisDetail.locationEntries.map((entry, idx) => ({
            id: `existing-${idx}`,
            countId: entry.countId,
            quantity: entry.quantity,
            location: entry.location || '',
            pallet_number: entry.pallet_number || ''
          }))
        );
      } else if (colisDetail.quantity > 0) {
        // Single entry with current data
        setDistributions([{
          id: 'initial',
          quantity: colisDetail.quantity,
          location: colisDetail.location || '',
          pallet_number: colisDetail.pallet_number || ''
        }]);
      } else {
        // Start with empty distribution
        setDistributions([{
          id: 'new-0',
          quantity: 0,
          location: '',
          pallet_number: ''
        }]);
      }
    }
  }, [open, colisDetail]);

  const totalQuantity = colisDetail.quantity;
  const distributedQuantity = useMemo(
    () => distributions.reduce((sum, d) => sum + d.quantity, 0),
    [distributions]
  );
  const remaining = totalQuantity - distributedQuantity;
  const isValid = remaining === 0 && distributions.every(d => d.quantity > 0);

  const addDistribution = () => {
    setDistributions(prev => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        quantity: Math.max(0, remaining),
        location: '',
        pallet_number: ''
      }
    ]);
  };

  const removeDistribution = (id: string) => {
    setDistributions(prev => prev.filter(d => d.id !== id));
  };

  const updateDistribution = (id: string, field: keyof StockDistribution, value: string | number) => {
    setDistributions(prev =>
      prev.map(d =>
        d.id === id ? { ...d, [field]: value } : d
      )
    );
  };

  const handleSave = async () => {
    if (!isValid) return;
    
    setSaving(true);
    try {
      const success = await onSave(distributions);
      if (success) {
        onOpenChange(false);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Dividir Stock - Coli {colisNumber}
            {colisName && <span className="text-muted-foreground font-normal">({colisName})</span>}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Total summary */}
          <div className={cn(
            "p-3 rounded-lg border",
            remaining === 0 ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"
          )}>
            <div className="flex items-center justify-between">
              <span className="font-medium">Total a distribuir:</span>
              <span className="text-lg font-bold">{totalQuantity} unidades</span>
            </div>
            <div className="flex items-center justify-between text-sm mt-1">
              <span>Distribuído:</span>
              <span className={cn(
                "font-medium",
                remaining === 0 ? "text-green-700" : "text-amber-700"
              )}>
                {distributedQuantity} / {totalQuantity}
              </span>
            </div>
            {remaining !== 0 && (
              <div className="flex items-center gap-1 text-amber-700 text-sm mt-1">
                <AlertCircle className="h-4 w-4" />
                <span>
                  {remaining > 0 
                    ? `Falta distribuir ${remaining} unidade${remaining > 1 ? 's' : ''}`
                    : `Excedeu em ${Math.abs(remaining)} unidade${Math.abs(remaining) > 1 ? 's' : ''}`
                  }
                </span>
              </div>
            )}
            {remaining === 0 && (
              <div className="flex items-center gap-1 text-green-700 text-sm mt-1">
                <CheckCircle2 className="h-4 w-4" />
                <span>Distribuição completa</span>
              </div>
            )}
          </div>

          {/* Distribution entries */}
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {distributions.map((dist, idx) => (
              <div 
                key={dist.id} 
                className="p-3 rounded-lg border bg-muted/30 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Localização {idx + 1}</span>
                  {distributions.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => removeDistribution(dist.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {/* Quantity */}
                  <div className="space-y-1">
                    <Label className="text-xs">Quantidade</Label>
                    <Input
                      type="number"
                      min={0}
                      max={totalQuantity}
                      value={dist.quantity}
                      onChange={(e) => updateDistribution(dist.id, 'quantity', parseInt(e.target.value) || 0)}
                      className="h-8"
                    />
                  </div>

                  {/* Location */}
                  <div className="space-y-1">
                    <Label className="text-xs flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      Localização
                    </Label>
                    <LocationSelect
                      value={dist.location}
                      onValueChange={(value) => updateDistribution(dist.id, 'location', value)}
                      placeholder="Selecionar..."
                      className="h-8"
                    />
                  </div>

                  {/* Pallet */}
                  <div className="space-y-1">
                    <Label className="text-xs flex items-center gap-1">
                      <Box className="h-3 w-3" />
                      Palete
                    </Label>
                    <PalletSelect
                      value={dist.pallet_number}
                      onValueChange={(value) => updateDistribution(dist.id, 'pallet_number', value)}
                      placeholder="Selecionar..."
                      className="h-8"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Add location button */}
          <Button
            variant="outline"
            className="w-full"
            onClick={addDistribution}
          >
            <Plus className="h-4 w-4 mr-2" />
            Adicionar outra localização
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={!isValid || saving}
          >
            {saving ? 'A guardar...' : 'Guardar Distribuição'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
