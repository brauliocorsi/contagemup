import { Bell, PackageX, TrendingDown, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useStockAlerts, StockAlert } from '@/hooks/useStockAlerts';

interface StockAlertsBellProps {
  onNavigateToProducts?: () => void;
}

export function StockAlertsBell({ onNavigateToProducts }: StockAlertsBellProps) {
  const { alerts, outOfStockCount, lowStockCount, totalAlerts, loading } = useStockAlerts();

  if (loading) {
    return (
      <Button variant="ghost" size="icon" disabled className="relative">
        <Bell className="h-5 w-5" />
      </Button>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className={`h-5 w-5 ${totalAlerts > 0 ? 'text-yellow-600' : ''}`} />
          {totalAlerts > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <Badge
                variant="destructive"
                className="relative h-5 min-w-5 flex items-center justify-center p-0 text-xs"
              >
                {totalAlerts > 99 ? '99+' : totalAlerts}
              </Badge>
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="p-3 border-b">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm">Alertas de Stock</h4>
            {totalAlerts > 0 && (
              <div className="flex gap-1">
                {outOfStockCount > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    {outOfStockCount} esgotados
                  </Badge>
                )}
                {lowStockCount > 0 && (
                  <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-300">
                    {lowStockCount} baixos
                  </Badge>
                )}
              </div>
            )}
          </div>
        </div>

        {totalAlerts === 0 ? (
          <div className="p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-green-100 mx-auto mb-3 flex items-center justify-center">
              <Bell className="h-6 w-6 text-green-600" />
            </div>
            <p className="text-sm text-muted-foreground">
              Todos os produtos estão com stock adequado
            </p>
          </div>
        ) : (
          <>
            <ScrollArea className="max-h-[300px]">
              <div className="p-2 space-y-1">
                {alerts.slice(0, 10).map((alert) => (
                  <AlertListItem key={alert.product.id} alert={alert} />
                ))}
              </div>
            </ScrollArea>
            
            {alerts.length > 10 && (
              <div className="p-2 border-t">
                <p className="text-xs text-center text-muted-foreground">
                  +{alerts.length - 10} mais alertas
                </p>
              </div>
            )}

            <div className="p-2 border-t">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-center gap-2"
                onClick={onNavigateToProducts}
              >
                Ver todos os produtos
                <ExternalLink className="h-3 w-3" />
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

function AlertListItem({ alert }: { alert: StockAlert }) {
  const isOutOfStock = alert.type === 'out_of_stock';

  return (
    <div
      className={`flex items-center gap-3 p-2 rounded-md ${
        isOutOfStock ? 'bg-red-50' : 'bg-yellow-50'
      }`}
    >
      <div
        className={`p-1.5 rounded-full ${
          isOutOfStock ? 'bg-red-100' : 'bg-yellow-100'
        }`}
      >
        {isOutOfStock ? (
          <PackageX className="h-3.5 w-3.5 text-red-600" />
        ) : (
          <TrendingDown className="h-3.5 w-3.5 text-yellow-600" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{alert.product.name}</p>
        <p className="text-xs text-muted-foreground font-mono">{alert.product.code}</p>
      </div>
      <Badge
        variant={isOutOfStock ? 'destructive' : 'outline'}
        className={`text-xs shrink-0 ${
          !isOutOfStock ? 'bg-yellow-100 text-yellow-700 border-yellow-300' : ''
        }`}
      >
        {alert.product.current_stock}
      </Badge>
    </div>
  );
}
