import { AlertTriangle, Package } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

export interface StockValidationError {
  product_id: string;
  product_code: string;
  product_name: string;
  requested: number;
  available: number;
}

interface StockValidationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  errors: StockValidationError[];
  onAdjustQuantities: () => void;
  onConfirmPartial: () => void;
}

export function StockValidationDialog({
  open,
  onOpenChange,
  errors,
  onAdjustQuantities,
  onConfirmPartial,
}: StockValidationDialogProps) {
  const hasPartiallyAvailable = errors.some(e => e.available > 0);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Stock Insuficiente
          </AlertDialogTitle>
          <AlertDialogDescription>
            Os seguintes produtos não têm stock suficiente para a quantidade solicitada:
          </AlertDialogDescription>
        </AlertDialogHeader>

        <ScrollArea className="max-h-[300px]">
          <div className="space-y-2">
            {errors.map((error) => (
              <div
                key={error.product_id}
                className="flex items-center justify-between p-3 rounded-lg bg-destructive/10 border border-destructive/20"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Package className="h-4 w-4 text-destructive shrink-0" />
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-medium truncate">
                      {error.product_code}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {error.product_name}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge variant="destructive">
                    Pedido: {error.requested}
                  </Badge>
                  <Badge variant="secondary">
                    Disponível: {error.available}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel onClick={() => onOpenChange(false)}>
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onAdjustQuantities}
            className="bg-secondary text-secondary-foreground hover:bg-secondary/80"
          >
            Ajustar Quantidades
          </AlertDialogAction>
          {hasPartiallyAvailable && (
            <AlertDialogAction
              onClick={onConfirmPartial}
              className="bg-primary"
            >
              Confirmar Parcial
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
