import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ProductDamageWithProduct } from '@/types/damages';
import { Package, MapPin, Box, Calendar, FileText, Hash, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';

interface DamageDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  damage: ProductDamageWithProduct;
}

export function DamageDetailDialog({ open, onOpenChange, damage }: DamageDetailDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Detalhes da Avaria
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Product */}
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
            <Package className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div>
              <p className="font-medium">{damage.product?.name || 'Produto removido'}</p>
              <p className="text-sm text-muted-foreground">{damage.product?.code}</p>
            </div>
          </div>

          {/* Type & Status */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="destructive">{damage.damage_type}</Badge>
            {damage.status === 'active' ? (
              <Badge variant="destructive">Ativo</Badge>
            ) : (
              <Badge variant="secondary" className="bg-green-100 text-green-800">
                {damage.resolution_type || 'Resolvido'}
              </Badge>
            )}
            {damage.colis_number && (
              <Badge variant="outline">Coli {damage.colis_number}</Badge>
            )}
          </div>

          {/* Quantity */}
          <div className="flex items-center gap-3">
            <Hash className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">Quantidade: <strong>{damage.quantity}</strong></span>
          </div>

          {/* Location */}
          {(damage.location || damage.pallet_number) && (
            <div className="space-y-1">
              {damage.location && (
                <div className="flex items-center gap-3">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{damage.location}</span>
                </div>
              )}
              {damage.pallet_number && (
                <div className="flex items-center gap-3">
                  <Box className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{damage.pallet_number}</span>
                </div>
              )}
            </div>
          )}

          {/* Description */}
          {damage.description && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Descrição
              </div>
              <p className="text-sm text-muted-foreground pl-6 whitespace-pre-wrap">
                {damage.description}
              </p>
            </div>
          )}

          {/* Resolution notes */}
          {damage.resolution_notes && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Notas de Resolução
              </div>
              <p className="text-sm text-muted-foreground pl-6 whitespace-pre-wrap">
                {damage.resolution_notes}
              </p>
            </div>
          )}

          {/* Dates */}
          <div className="space-y-1 border-t pt-3">
            <div className="flex items-center gap-3 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              Reportado: {format(new Date(damage.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: pt })}
            </div>
            {damage.resolved_at && (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                Resolvido: {format(new Date(damage.resolved_at), "dd/MM/yyyy 'às' HH:mm", { locale: pt })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
