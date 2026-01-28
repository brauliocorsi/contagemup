import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RESOLUTION_TYPES, ProductDamageWithProduct } from '@/types/damages';
import { CheckCircle } from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';

interface DamageResolutionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  damage: ProductDamageWithProduct;
  onSubmit: (data: {
    id: string;
    resolution_type: string;
    resolution_notes?: string;
  }) => Promise<unknown>;
  isLoading?: boolean;
}

export function DamageResolutionDialog({
  open,
  onOpenChange,
  damage,
  onSubmit,
  isLoading
}: DamageResolutionDialogProps) {
  const [resolutionType, setResolutionType] = useState<string>('');
  const [resolutionNotes, setResolutionNotes] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!resolutionType) return;

    await onSubmit({
      id: damage.id,
      resolution_type: resolutionType,
      resolution_notes: resolutionNotes || undefined,
    });

    // Reset form
    setResolutionType('');
    setResolutionNotes('');
    onOpenChange(false);
  };

  const handleCancel = () => {
    setResolutionType('');
    setResolutionNotes('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            Resolver Avaria
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="p-3 bg-muted rounded-lg space-y-2">
            <p className="font-medium">{damage.product?.name || 'Produto'}</p>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Código: {damage.product?.code}</p>
              <p>Quantidade: {damage.quantity} unidade(s)</p>
              <p>Tipo: {damage.damage_type}</p>
              <p>Registado: {format(new Date(damage.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: pt })}</p>
            </div>
            {damage.description && (
              <p className="text-sm mt-2 p-2 bg-background rounded">
                {damage.description}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="resolutionType">Tipo de Resolução *</Label>
            <Select value={resolutionType} onValueChange={setResolutionType} required>
              <SelectTrigger>
                <SelectValue placeholder="Como foi resolvido?" />
              </SelectTrigger>
              <SelectContent>
                {RESOLUTION_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="resolutionNotes">Notas da Resolução</Label>
            <Textarea
              id="resolutionNotes"
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
              placeholder="Detalhes sobre como foi resolvido..."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancel}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!resolutionType || isLoading}>
              {isLoading ? 'A resolver...' : 'Resolver Avaria'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
