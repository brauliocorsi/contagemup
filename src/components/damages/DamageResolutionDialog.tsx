import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LocationSelect } from '@/components/counting/LocationSelect';
import { RESOLUTION_OPTIONS, ProductDamageWithProduct } from '@/types/damages';
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
    destination_location?: string;
    supplier_reference?: string;
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
  const [destination, setDestination] = useState('');
  const [supplierRef, setSupplierRef] = useState('');

  const option = useMemo(
    () => RESOLUTION_OPTIONS.find((o) => o.value === resolutionType),
    [resolutionType]
  );

  const reset = () => {
    setResolutionType('');
    setResolutionNotes('');
    setDestination('');
    setSupplierRef('');
  };

  const canSubmit =
    !!option &&
    (!option.needsDestination || !!destination) &&
    (!option.needsSupplierRef || !!supplierRef.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    await onSubmit({
      id: damage.id,
      resolution_type: resolutionType,
      resolution_notes: resolutionNotes || undefined,
      destination_location: option?.needsDestination ? destination : undefined,
      supplier_reference: option?.needsSupplierRef ? supplierRef.trim() : undefined,
    });

    reset();
    onOpenChange(false);
  };

  const handleCancel = () => {
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-primary" />
            Resolver item em quarentena
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="p-3 bg-muted rounded-lg space-y-2">
            <p className="font-medium">{damage.product?.name || 'Produto'}</p>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Código: {damage.product?.code}</p>
              <p>Quantidade: {damage.quantity} unidade(s)</p>
              {damage.colis_number && <p>Coli: {damage.colis_number}</p>}
              <p>Tipo: {damage.damage_type}</p>
              <p>Origem: {damage.source_location || '—'}</p>
              <p>Registado: {format(new Date(damage.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: pt })}</p>
            </div>
            {damage.description && (
              <p className="text-sm mt-2 p-2 bg-background rounded">
                {damage.description}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="resolutionType">Destino do item *</Label>
            <Select value={resolutionType} onValueChange={setResolutionType} required>
              <SelectTrigger>
                <SelectValue placeholder="Como foi resolvido?" />
              </SelectTrigger>
              <SelectContent>
                {RESOLUTION_OPTIONS.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {option && (
              <p className="text-xs text-muted-foreground">{option.description}</p>
            )}
            {resolutionType === 'recuperado' && !damage.source_location && (
              <p className="text-xs text-destructive">
                Este registo não tem localização de origem — o item volta ao stock sem localização.
              </p>
            )}
          </div>

          {option?.needsDestination && (
            <div className="space-y-2">
              <Label>Localização de destino *</Label>
              <LocationSelect value={destination} onValueChange={setDestination} />
            </div>
          )}

          {option?.needsSupplierRef && (
            <div className="space-y-2">
              <Label htmlFor="supplierRef">Referência do fornecedor *</Label>
              <Input
                id="supplierRef"
                value={supplierRef}
                onChange={(e) => setSupplierRef(e.target.value)}
                placeholder="Ex: RMA-2026-0142"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="resolutionNotes">Notas</Label>
            <Textarea
              id="resolutionNotes"
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
              placeholder="Detalhes sobre a decisão..."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancel}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!canSubmit || isLoading}>
              {isLoading ? 'A resolver...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
