import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { NumericInput } from '@/components/ui/numeric-input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DAMAGE_TYPES, ProductDamageWithProduct } from '@/types/damages';
import { Edit } from 'lucide-react';

interface DamageEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  damage: ProductDamageWithProduct;
  onSubmit: (data: {
    id: string;
    damage_type?: string;
    description?: string | null;
    quantity?: number;
    location?: string | null;
    colis_number?: number | null;
  }) => Promise<unknown>;
  isLoading?: boolean;
}

export function DamageEditDialog({
  open,
  onOpenChange,
  damage,
  onSubmit,
  isLoading
}: DamageEditDialogProps) {
  const [damageType, setDamageType] = useState(damage.damage_type);
  const [description, setDescription] = useState(damage.description || '');
  const [quantity, setQuantity] = useState(damage.quantity);
  const [location, setLocation] = useState(damage.location || '');
  const [colisNumber, setColisNumber] = useState<string>(damage.colis_number?.toString() || '');

  useEffect(() => {
    setDamageType(damage.damage_type);
    setDescription(damage.description || '');
    setQuantity(damage.quantity);
    setLocation(damage.location || '');
    setColisNumber(damage.colis_number?.toString() || '');
  }, [damage]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    await onSubmit({
      id: damage.id,
      damage_type: damageType,
      description: description || null,
      quantity,
      location: location || null,
      colis_number: colisNumber ? parseInt(colisNumber) : null,
    });

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="h-5 w-5 text-primary" />
            Editar Avaria
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="p-3 bg-muted rounded-lg">
            <p className="font-medium">{damage.product?.name || 'Produto'}</p>
            <p className="text-sm text-muted-foreground">{damage.product?.code}</p>
          </div>

          <div className="space-y-2">
            <Label>Tipo de Dano *</Label>
            <Select value={damageType} onValueChange={setDamageType}>
              <SelectTrigger>
                <SelectValue placeholder="Tipo de dano" />
              </SelectTrigger>
              <SelectContent>
                {DAMAGE_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Quantidade *</Label>
            <NumericInput
              min={1}
              value={quantity}
              onChange={setQuantity}
            />
          </div>

          <div className="space-y-2">
            <Label>Nº Coli</Label>
            <Input
              type="number"
              min={1}
              value={colisNumber}
              onChange={(e) => setColisNumber(e.target.value)}
              placeholder="Opcional"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Localização</Label>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Opcional"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalhes sobre o dano..."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!damageType || quantity < 1 || isLoading}>
              {isLoading ? 'A guardar...' : 'Guardar Alterações'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
