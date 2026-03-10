import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { NumericInput } from '@/components/ui/numeric-input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Package } from 'lucide-react';

interface BulkMinStockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedProductIds: string[];
  onSuccess: () => void;
}

export function BulkMinStockDialog({ 
  open, 
  onOpenChange, 
  selectedProductIds,
  onSuccess 
}: BulkMinStockDialogProps) {
  const [minStock, setMinStock] = useState<number>(5);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (selectedProductIds.length === 0) return;
    
    setLoading(true);
    
    try {
      const { error } = await supabase
        .from('products')
        .update({ min_stock: minStock })
        .in('id', selectedProductIds);

      if (error) throw error;

      toast({
        title: 'Stock mínimo atualizado',
        description: `${selectedProductIds.length} produto(s) atualizados para stock mínimo de ${minStock}`,
      });
      
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar o stock mínimo',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Definir Stock Mínimo em Lote
          </DialogTitle>
          <DialogDescription>
            Definir o mesmo stock mínimo para {selectedProductIds.length} produto(s) selecionado(s).
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="minStock">Stock Mínimo</Label>
            <NumericInput
              id="minStock"
              min={0}
              value={minStock}
              onChange={setMinStock}
              placeholder="Ex: 5"
            />
            <p className="text-sm text-muted-foreground">
              Quando o stock atual ficar abaixo deste valor, será exibido um alerta.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'A atualizar...' : 'Aplicar a todos'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
