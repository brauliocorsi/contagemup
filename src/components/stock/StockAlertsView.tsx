import { useState, useMemo } from 'react';
import { AlertTriangle, PackageX, TrendingDown, Search, Filter } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useStockAlerts } from '@/hooks/useStockAlerts';
import { Skeleton } from '@/components/ui/skeleton';

type FilterType = 'all' | 'negative_stock' | 'out_of_stock' | 'low_stock';

export function StockAlertsView() {
  const { alerts, outOfStockCount, lowStockCount, totalAlerts, loading } = useStockAlerts();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');

  const filteredAlerts = useMemo(() => {
    return alerts.filter((alert) => {
      const matchesSearch =
        alert.product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        alert.product.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        alert.product.category.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = filterType === 'all' || filterType === alert.type;
      return matchesSearch && matchesType;
    });
  }, [alerts, searchTerm, filterType]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-4 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-muted">
                <AlertTriangle className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <div className="text-2xl font-bold">{totalAlerts}</div>
                <p className="text-sm text-muted-foreground">Total de Alertas</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-destructive/10">
                <PackageX className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <div className="text-2xl font-bold text-destructive">{outOfStockCount}</div>
                <p className="text-sm text-destructive/80">Produtos Esgotados</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-yellow-500/50 bg-yellow-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-yellow-500/10">
                <TrendingDown className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-yellow-600">{lowStockCount}</div>
                <p className="text-sm text-yellow-600/80">Stock Baixo</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Alertas de Stock Mínimo
            </CardTitle>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 w-full sm:w-64"
                />
              </div>
              <Select value={filterType} onValueChange={(v) => setFilterType(v as FilterType)}>
                <SelectTrigger className="w-full sm:w-40">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="negative_stock">Stock negativo</SelectItem>
                  <SelectItem value="out_of_stock">Esgotados</SelectItem>
                  <SelectItem value="low_stock">Stock Baixo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {totalAlerts === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-full bg-green-100 mx-auto mb-4 flex items-center justify-center">
                <AlertTriangle className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-lg font-medium text-green-700 mb-2">Stock OK</h3>
              <p className="text-muted-foreground">
                Todos os produtos estão com stock adequado.
              </p>
            </div>
          ) : filteredAlerts.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                Nenhum alerta encontrado com os filtros aplicados.
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => {
                  setSearchTerm('');
                  setFilterType('all');
                }}
              >
                Limpar filtros
              </Button>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-center">Colis</TableHead>
                    <TableHead className="text-center">Stock Actual</TableHead>
                    <TableHead className="text-center">Stock Mínimo</TableHead>
                    <TableHead className="text-center">Estado</TableHead>
                    <TableHead>Localização</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAlerts.map((alert) => {
                    const isOutOfStock = alert.type === 'out_of_stock' || alert.type === 'negative_stock';
                    return (
                      <TableRow
                        key={alert.product.id}
                        className={isOutOfStock ? 'bg-destructive/5' : 'bg-yellow-500/5'}
                      >
                        <TableCell className="font-mono text-sm">
                          {alert.product.code}
                        </TableCell>
                        <TableCell className="font-medium">
                          {alert.product.name}
                        </TableCell>
                        <TableCell>{alert.product.category}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline">{alert.product.total_colis}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant={isOutOfStock ? 'destructive' : 'outline'}
                            className={
                              !isOutOfStock
                                ? 'bg-yellow-100 text-yellow-700 border-yellow-300'
                                : ''
                            }
                          >
                            {alert.product.current_stock} un.
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center text-muted-foreground">
                          {alert.product.min_stock} un.
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant={isOutOfStock ? 'destructive' : 'outline'}
                            className={
                              !isOutOfStock
                                ? 'bg-yellow-100 text-yellow-700 border-yellow-300'
                                : ''
                            }
                          >
                            {isOutOfStock ? (
                              <>
                                <PackageX className="h-3 w-3 mr-1" />
                                Esgotado
                              </>
                            ) : (
                              <>
                                <TrendingDown className="h-3 w-3 mr-1" />
                                Baixo
                              </>
                            )}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {alert.product.location || '-'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {filteredAlerts.length > 0 && (
            <div className="mt-4 text-sm text-muted-foreground text-center">
              A mostrar {filteredAlerts.length} de {totalAlerts} alertas
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
