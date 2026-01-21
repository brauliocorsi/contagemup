import { AlertTriangle, PackageX, AlertCircle, TrendingDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useStockAlerts, StockAlert } from '@/hooks/useStockAlerts';

interface StockAlertsPanelProps {
  onNavigateToProduct?: (productId: string) => void;
  maxItems?: number;
}

export function StockAlertsPanel({ onNavigateToProduct, maxItems = 10 }: StockAlertsPanelProps) {
  const { alerts, outOfStockCount, lowStockCount, totalAlerts, loading } = useStockAlerts();

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Alertas de Stock
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">A carregar...</p>
        </CardContent>
      </Card>
    );
  }

  if (totalAlerts === 0) {
    return (
      <Card className="border-green-200 bg-green-50/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 text-green-700">
            <AlertCircle className="h-4 w-4" />
            Stock OK
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-green-600">
            Todos os produtos estão com stock adequado.
          </p>
        </CardContent>
      </Card>
    );
  }

  const displayedAlerts = alerts.slice(0, maxItems);
  const hasMore = alerts.length > maxItems;

  return (
    <Card className="border-yellow-200 bg-yellow-50/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            Alertas de Stock
          </CardTitle>
          <div className="flex gap-2">
            {outOfStockCount > 0 && (
              <Badge variant="destructive" className="gap-1">
                <PackageX className="h-3 w-3" />
                {outOfStockCount} esgotados
              </Badge>
            )}
            {lowStockCount > 0 && (
              <Badge variant="outline" className="gap-1 bg-yellow-100 text-yellow-700 border-yellow-300">
                <TrendingDown className="h-3 w-3" />
                {lowStockCount} baixos
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="max-h-[300px]">
          <div className="space-y-2">
            {displayedAlerts.map((alert) => (
              <AlertItem
                key={alert.product.id}
                alert={alert}
                onClick={() => onNavigateToProduct?.(alert.product.id)}
              />
            ))}
            {hasMore && (
              <p className="text-xs text-muted-foreground text-center pt-2">
                +{alerts.length - maxItems} mais alertas
              </p>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

interface AlertItemProps {
  alert: StockAlert;
  onClick?: () => void;
}

function AlertItem({ alert, onClick }: AlertItemProps) {
  const isOutOfStock = alert.type === 'out_of_stock';

  return (
    <div
      className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
        isOutOfStock
          ? 'bg-red-50 hover:bg-red-100 border border-red-200'
          : 'bg-yellow-50 hover:bg-yellow-100 border border-yellow-200'
      }`}
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        <div
          className={`p-2 rounded-full ${
            isOutOfStock ? 'bg-red-100' : 'bg-yellow-100'
          }`}
        >
          {isOutOfStock ? (
            <PackageX className="h-4 w-4 text-red-600" />
          ) : (
            <TrendingDown className="h-4 w-4 text-yellow-600" />
          )}
        </div>
        <div>
        <div>
            <p className="font-medium text-sm">{alert.product.name}</p>
            <p className="text-xs text-muted-foreground font-mono">
              {alert.product.code}
            </p>
          </div>
        </div>
      </div>
      <div className="text-right">
        <Badge
          variant={isOutOfStock ? 'destructive' : 'outline'}
          className={!isOutOfStock ? 'bg-yellow-100 text-yellow-700 border-yellow-300' : ''}
        >
          {alert.product.current_stock} / {alert.product.min_stock}
        </Badge>
        <div className="flex items-center justify-end gap-2 mt-1">
          {alert.product.total_colis > 1 && (
            <span className="text-xs text-muted-foreground">
              {alert.product.total_colis} colis
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {isOutOfStock ? 'Esgotado' : 'Stock baixo'}
          </span>
        </div>
      </div>
    </div>
  );
}
