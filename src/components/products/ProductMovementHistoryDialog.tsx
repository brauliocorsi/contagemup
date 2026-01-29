import { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useProductMovementHistory, useMovementUserNames, UnifiedMovement } from '@/hooks/useProductMovementHistory';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { 
  ArrowUpCircle, ArrowDownCircle, Package, User, 
  History, Truck, ClipboardCheck, MapPin, Box
} from 'lucide-react';

interface ProductMovementHistoryDialogProps {
  productId: string | null;
  productName: string;
  productCode: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TYPE_CONFIG = {
  entrada: {
    label: 'Entrada',
    icon: ArrowUpCircle,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
    textColor: 'text-green-800',
  },
  saida: {
    label: 'Saída',
    icon: ArrowDownCircle,
    color: 'text-red-600',
    bgColor: 'bg-red-100',
    textColor: 'text-red-800',
  },
  contagem_inc: {
    label: 'Contagem +',
    icon: ClipboardCheck,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-800',
  },
  contagem_dec: {
    label: 'Contagem -',
    icon: ClipboardCheck,
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
    textColor: 'text-orange-800',
  },
  picking: {
    label: 'Picking',
    icon: Truck,
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
    textColor: 'text-purple-800',
  },
};

function MovementRow({ 
  movement, 
  userName 
}: { 
  movement: UnifiedMovement; 
  userName: string | null;
}) {
  const config = TYPE_CONFIG[movement.type];
  const Icon = config.icon;
  
  const isPositive = movement.type === 'entrada' || movement.type === 'contagem_inc';

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
      <div className={`mt-0.5 ${config.color}`}>
        <Icon className="h-5 w-5" />
      </div>
      
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Badge className={`${config.bgColor} ${config.textColor}`}>
            {config.label}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {format(new Date(movement.created_at), "dd/MM/yy 'às' HH:mm", { locale: pt })}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className={`font-bold text-lg ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
            {isPositive ? '+' : '-'}{movement.quantity}
          </span>
          {movement.colis_number && (
            <Badge variant="outline" className="text-xs">
              Colis {movement.colis_number}
            </Badge>
          )}
        </div>

        {/* Details based on source */}
        <div className="text-sm text-muted-foreground space-y-0.5">
          {movement.reason && (
            <p>Motivo: <span className="font-medium text-foreground">{movement.reason}</span></p>
          )}
          {movement.reference && (
            <p>Ref: <span className="font-medium text-foreground">{movement.reference}</span></p>
          )}
          {movement.session_name && (
            <p>Sessão: <span className="font-medium text-foreground">{movement.session_name}</span></p>
          )}
          {movement.location && (
            <p className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {movement.location}
              {movement.pallet_number && (
                <span className="flex items-center gap-1 ml-2">
                  <Box className="h-3 w-3" />
                  {movement.pallet_number}
                </span>
              )}
            </p>
          )}
          {movement.notes && (
            <p className="italic">{movement.notes}</p>
          )}
        </div>

        {userName && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground pt-1">
            <User className="h-3 w-3" />
            {userName}
          </div>
        )}
      </div>
    </div>
  );
}

export function ProductMovementHistoryDialog({
  productId,
  productName,
  productCode,
  open,
  onOpenChange,
}: ProductMovementHistoryDialogProps) {
  const { data: movements = [], isLoading } = useProductMovementHistory(open ? productId : null);
  
  // Get unique user IDs for name lookup
  const userIds = useMemo(() => {
    return [...new Set(movements.map(m => m.created_by).filter(Boolean))] as string[];
  }, [movements]);

  const { data: userNames = {} } = useMovementUserNames(userIds);

  // Filter movements by type for tabs
  const filteredMovements = useMemo(() => {
    return {
      all: movements,
      entradas: movements.filter(m => m.type === 'entrada' || m.type === 'contagem_inc'),
      saidas: movements.filter(m => m.type === 'saida' || m.type === 'picking' || m.type === 'contagem_dec'),
      contagens: movements.filter(m => m.type === 'contagem_inc' || m.type === 'contagem_dec'),
    };
  }, [movements]);

  // Calculate summary stats
  const summary = useMemo(() => {
    let totalEntradas = 0;
    let totalSaidas = 0;
    
    movements.forEach(m => {
      if (m.type === 'entrada' || m.type === 'contagem_inc') {
        totalEntradas += m.quantity;
      } else {
        totalSaidas += m.quantity;
      }
    });

    return {
      totalMovements: movements.length,
      totalEntradas,
      totalSaidas,
      balance: totalEntradas - totalSaidas,
    };
  }, [movements]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Histórico de Movimentações
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            <span className="font-mono">{productCode}</span>
            <span>-</span>
            <span>{productName}</span>
          </DialogDescription>
        </DialogHeader>

        {/* Summary Stats */}
        <div className="grid grid-cols-4 gap-2 p-3 bg-muted/50 rounded-lg">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="font-bold">{summary.totalMovements}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Entradas</p>
            <p className="font-bold text-green-600">+{summary.totalEntradas}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Saídas</p>
            <p className="font-bold text-red-600">-{summary.totalSaidas}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Balanço</p>
            <p className={`font-bold ${summary.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {summary.balance >= 0 ? '+' : ''}{summary.balance}
            </p>
          </div>
        </div>

        <Tabs defaultValue="all" className="flex-1">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="all" className="text-xs">
              Todos ({filteredMovements.all.length})
            </TabsTrigger>
            <TabsTrigger value="entradas" className="text-xs">
              Entradas ({filteredMovements.entradas.length})
            </TabsTrigger>
            <TabsTrigger value="saidas" className="text-xs">
              Saídas ({filteredMovements.saidas.length})
            </TabsTrigger>
            <TabsTrigger value="contagens" className="text-xs">
              Contagens ({filteredMovements.contagens.length})
            </TabsTrigger>
          </TabsList>

          {['all', 'entradas', 'saidas', 'contagens'].map(tabValue => (
            <TabsContent key={tabValue} value={tabValue} className="mt-3">
              <ScrollArea className="h-[400px] pr-4">
                {isLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3, 4].map(i => (
                      <Skeleton key={i} className="h-24 w-full" />
                    ))}
                  </div>
                ) : filteredMovements[tabValue as keyof typeof filteredMovements].length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <History className="h-12 w-12 mb-4 opacity-50" />
                    <p>Nenhuma movimentação encontrada</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredMovements[tabValue as keyof typeof filteredMovements].map(movement => (
                      <MovementRow
                        key={`${movement.source}-${movement.id}`}
                        movement={movement}
                        userName={movement.created_by ? userNames[movement.created_by] || null : null}
                      />
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
