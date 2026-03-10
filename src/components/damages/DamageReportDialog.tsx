import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DAMAGE_TYPES } from '@/types/damages';
import { Product } from '@/types/stock';
import { AlertOctagon } from 'lucide-react';

interface DamageReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product;
  onSubmit: (data: {
    product_id: string;
    quantity: number;
    colis_number?: number;
    damage_type: string;
    description?: string;
    location?: string;
    pallet_number?: string;
  }) => Promise<unknown>;
  isLoading?: boolean;
}

export function DamageReportDialog({
  open,
  onOpenChange,
  product,
  onSubmit,
  isLoading
}: DamageReportDialogProps) {
  const [quantity, setQuantity] = useState(1);
  const [colisNumber, setColisNumber] = useState<number | undefined>(undefined);
  const [damageType, setDamageType] = useState<string>('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState(product.location || '');
  const [palletNumber, setPalletNumber] = useState(product.pallet_number || '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!damageType) return;

    await onSubmit({
      product_id: product.id,
      quantity,
      colis_number: colisNumber,
      damage_type: damageType,
      description: description || undefined,
      location: location || undefined,
      pallet_number: palletNumber || undefined,
    });

    // Reset form
    setQuantity(1);
    setColisNumber(undefined);
    setDamageType('');
    setDescription('');
    setLocation(product.location || '');
    setPalletNumber(product.pallet_number || '');
    onOpenChange(false);
  };

  const handleCancel = () => {
    setQuantity(1);
    setColisNumber(undefined);
    setDamageType('');
    setDescription('');
    setLocation(product.location || '');
    setPalletNumber(product.pallet_number || '');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertOctagon className="h-5 w-5 text-destructive" />
            Reportar Avaria
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="p-3 bg-muted rounded-lg">
            <p className="font-medium">{product.name}</p>
            <p className="text-sm text-muted-foreground">Código: {product.code}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantidade *</Label>
              <NumericInput
                id="quantity"
                min={1}
                value={quantity}
                onChange={setQuantity}
              />
            </div>

            {product.total_colis > 1 && (
              <div className="space-y-2">
                <Label htmlFor="colisNumber">Coli Afetado</Label>
                <Select
                  value={colisNumber?.toString() || 'none'}
                  onValueChange={(v) => setColisNumber(v === 'none' ? undefined : parseInt(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Não especificado</SelectItem>
                    {Array.from({ length: product.total_colis }, (_, i) => i + 1).map((num) => (
                      <SelectItem key={num} value={num.toString()}>
                        Coli {num}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="damageType">Tipo de Dano *</Label>
            <Select value={damageType} onValueChange={setDamageType} required>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar tipo de dano" />
              </SelectTrigger>
              <SelectContent>
                {DAMAGE_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva o dano em detalhe..."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="location">Localização</Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Ex: A1-01"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="palletNumber">Palete</Label>
              <Input
                id="palletNumber"
                value={palletNumber}
                onChange={(e) => setPalletNumber(e.target.value)}
                placeholder="Ex: P001"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancel}>
              Cancelar
            </Button>
            <Button type="submit" variant="destructive" disabled={!damageType || isLoading}>
              {isLoading ? 'A registar...' : 'Registar Avaria'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
