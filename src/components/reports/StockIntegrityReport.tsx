import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  RefreshCw, 
  Download,
  Shield,
  Database,
  TrendingUp,
  TrendingDown,
  Activity,
  Layers,
  MapPin,
  Wrench
} from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { loadXLSX } from '@/lib/lazyXlsx';
import { BulkStockCorrectionDialog } from './BulkStockCorrectionDialog';

interface IntegrityCheck {
  productId: string;
  code: string;
  name: string;
  totalColis: number;
  dbStock: number;
  calculatedStock: number;
  difference: number;
  status: 'ok' | 'mismatch' | 'warning';
  damagedStock: number;
}

interface ColisImbalance {
  productId: string;
  code: string;
  name: string;
  totalColis: number;
  colisQuantities: { colisNumber: number; quantity: number; excess: number }[];
  minQuantity: number;
  maxQuantity: number;
  totalExcess: number;
  locations: string[];
}

interface IntegrityStats {
  totalProducts: number;
  okCount: number;
  mismatchCount: number;
  warningCount: number;
  lastCheck: Date | null;
  totalDamagedUnits: number;
  productsWithDamages: number;
  imbalancedProducts: number;
}

export function StockIntegrityReport() {
  const queryClient = useQueryClient();
  const [lastCheckTime, setLastCheckTime] = useState<Date | null>(null);
  const [showCorrectionDialog, setShowCorrectionDialog] = useState(false);

  // Fetch integrity data
  const { data: integrityData, isLoading, refetch } = useQuery({
    queryKey: ['stock-integrity'],
    queryFn: async () => {
      // Fetch all products
      const { data: products, error: productsError } = await supabase
        .from('products')
        .select('id, code, name, total_colis, current_stock, damaged_stock')
        .order('name');

      if (productsError) throw productsError;

      // Fetch all counts with location info
      const { data: counts, error: countsError } = await supabase
        .from('counts')
        .select('product_id, colis_number, quantity, location');

      if (countsError) throw countsError;

      // Calculate expected stock for each product and detect imbalances
      const checks: IntegrityCheck[] = [];
      const imbalances: ColisImbalance[] = [];

      products.forEach(product => {
        const productCounts = counts.filter(c => c.product_id === product.id);
        
        let calculatedStock: number;
        const colisQuantities: Record<number, number> = {};
        
        if (product.total_colis <= 1) {
          // Single colis: sum all quantities
          calculatedStock = productCounts.reduce((sum, c) => sum + c.quantity, 0);
          colisQuantities[1] = calculatedStock;
        } else {
          // Multi-colis: minimum across all colis numbers
          for (let i = 1; i <= product.total_colis; i++) {
            colisQuantities[i] = 0;
          }
          productCounts.forEach(c => {
            if (colisQuantities[c.colis_number] !== undefined) {
              colisQuantities[c.colis_number] += c.quantity;
            }
          });
          const quantities = Object.values(colisQuantities);
          calculatedStock = quantities.length > 0 ? Math.min(...quantities) : 0;
        }

        const difference = product.current_stock - calculatedStock;
        let status: 'ok' | 'mismatch' | 'warning' = 'ok';
        
        if (difference !== 0) {
          status = Math.abs(difference) > 5 ? 'mismatch' : 'warning';
        }

        checks.push({
          productId: product.id,
          code: product.code,
          name: product.name,
          totalColis: product.total_colis,
          dbStock: product.current_stock,
          calculatedStock,
          difference,
          status,
          damagedStock: product.damaged_stock || 0,
        });

        // Detect colis imbalances for multi-colis products
        if (product.total_colis > 1) {
          const quantities = Object.values(colisQuantities);
          const minQty = Math.min(...quantities);
          const maxQty = Math.max(...quantities);
          
          if (maxQty > minQty) {
            // Get unique locations for this product
            const locations = [...new Set(
              productCounts
                .filter(c => c.location)
                .map(c => c.location!)
            )];

            imbalances.push({
              productId: product.id,
              code: product.code,
              name: product.name,
              totalColis: product.total_colis,
              colisQuantities: Object.entries(colisQuantities).map(([num, qty]) => ({
                colisNumber: parseInt(num),
                quantity: qty,
                excess: qty - minQty
              })),
              minQuantity: minQty,
              maxQuantity: maxQty,
              totalExcess: quantities.reduce((sum, qty) => sum + (qty - minQty), 0),
              locations
            });
          }
        }
      });

      const stats: IntegrityStats = {
        totalProducts: checks.length,
        okCount: checks.filter(c => c.status === 'ok').length,
        mismatchCount: checks.filter(c => c.status === 'mismatch').length,
        warningCount: checks.filter(c => c.status === 'warning').length,
        lastCheck: new Date(),
        totalDamagedUnits: products.reduce((sum, p) => sum + (p.damaged_stock || 0), 0),
        productsWithDamages: products.filter(p => (p.damaged_stock || 0) > 0).length,
        imbalancedProducts: imbalances.length,
      };

      setLastCheckTime(new Date());

      return { checks, stats, imbalances };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Sync stock mutation (recalculates current_stock from counts)
  const syncStockMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('recalculate_all_stock');
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Stock recalculado com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['stock-integrity'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      refetch();
    },
    onError: (error) => {
      toast.error('Erro ao recalcular stock: ' + (error as Error).message);
    },
  });

  // syncCountsMutation removed in stock refactor Phase 1 (RPC sync_counts_with_current_stock dropped).

  const handleExport = async () => {
      const XLSX = await loadXLSX();
    if (!integrityData) return;

    const exportData = integrityData.checks
      .filter(c => c.status !== 'ok')
      .map(c => ({
        'Código': c.code,
        'Nome': c.name,
        'Colis': c.totalColis,
        'Stock BD': c.dbStock,
        'Stock Calculado': c.calculatedStock,
        'Diferença': c.difference,
        'Estado': c.status === 'mismatch' ? 'Erro' : 'Aviso',
        'Avarias': c.damagedStock,
      }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Integridade');
    XLSX.writeFile(wb, `integridade_stock_${format(new Date(), 'yyyy-MM-dd_HHmm')}.xlsx`);
    toast.success('Relatório exportado!');
  };

  const handleExportImbalances = async () => {
      const XLSX = await loadXLSX();
    if (!integrityData?.imbalances) return;

    const exportData = integrityData.imbalances.flatMap(item => 
      item.colisQuantities.map(coli => ({
        'Código': item.code,
        'Nome': item.name,
        'Coli': `Coli ${coli.colisNumber}`,
        'Quantidade': coli.quantity,
        'Excedente': coli.excess > 0 ? `+${coli.excess}` : '-',
        'Sets Completos': item.minQuantity,
        'Localizações': item.locations.join(', ') || '-'
      }))
    );

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Colis Incompletos');
    XLSX.writeFile(wb, `colis_incompletos_${format(new Date(), 'yyyy-MM-dd_HHmm')}.xlsx`);
    toast.success('Relatório de colis incompletos exportado!');
  };

  const stats = integrityData?.stats;
  const issues = integrityData?.checks.filter(c => c.status !== 'ok') || [];
  const imbalances = integrityData?.imbalances || [];

  const getHealthScore = () => {
    if (!stats) return 0;
    return Math.round((stats.okCount / stats.totalProducts) * 100);
  };

  const healthScore = getHealthScore();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Verificação de Integridade do Stock
          </CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Verificar
            </Button>
            {issues.length > 0 && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExport}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Exportar
                </Button>
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => setShowCorrectionDialog(true)}
                  title="Corrigir stock de múltiplos produtos"
                >
                  <Wrench className="h-4 w-4 mr-2" />
                  Corrigir Stock
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => syncStockMutation.mutate()}
                  disabled={syncStockMutation.isPending}
                  title="Recalcula current_stock a partir dos counts"
                >
                  <Database className="h-4 w-4 mr-2" />
                  {syncStockMutation.isPending ? 'A recalcular...' : 'Recalcular Stock'}
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Health Score */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <Card className="md:col-span-2">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Saúde do Sistema</p>
                  <p className={`text-4xl font-bold ${
                    healthScore >= 95 ? 'text-green-600' :
                    healthScore >= 80 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {healthScore}%
                  </p>
                </div>
                <Activity className={`h-12 w-12 ${
                  healthScore >= 95 ? 'text-green-600' :
                  healthScore >= 80 ? 'text-yellow-600' : 'text-red-600'
                }`} />
              </div>
              {lastCheckTime && (
                <p className="text-xs text-muted-foreground mt-2">
                  Última verificação: {format(lastCheckTime, "dd/MM/yyyy 'às' HH:mm", { locale: pt })}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6 text-center">
              <CheckCircle2 className="h-8 w-8 text-green-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-green-600">{stats?.okCount || 0}</p>
              <p className="text-sm text-muted-foreground">Corretos</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6 text-center">
              <AlertTriangle className="h-8 w-8 text-yellow-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-yellow-600">{stats?.warningCount || 0}</p>
              <p className="text-sm text-muted-foreground">Avisos</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6 text-center">
              <XCircle className="h-8 w-8 text-red-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-red-600">{stats?.mismatchCount || 0}</p>
              <p className="text-sm text-muted-foreground">Erros</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6 text-center">
              <AlertTriangle className="h-8 w-8 text-orange-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-orange-600">{stats?.productsWithDamages || 0}</p>
              <p className="text-sm text-muted-foreground">Com Avarias</p>
              {(stats?.totalDamagedUnits || 0) > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {stats?.totalDamagedUnits} un. danificadas
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Issues List */}
        {issues.length > 0 ? (
          <div className="space-y-2">
            <h3 className="font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              Discrepâncias Encontradas ({issues.length})
            </h3>
            <ScrollArea className="h-[300px] border rounded-lg">
              <div className="p-4 space-y-2">
                {issues.map((item) => (
                  <div
                    key={item.productId}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      item.status === 'mismatch' 
                        ? 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-900' 
                        : 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950/20 dark:border-yellow-900'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium">{item.code}</span>
                        {item.totalColis > 1 && (
                          <Badge variant="outline" className="text-xs">
                            {item.totalColis} colis
                          </Badge>
                        )}
                        {item.damagedStock > 0 && (
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300 text-xs gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            {item.damagedStock} avariado{item.damagedStock > 1 ? 's' : ''}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{item.name}</p>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <div className="text-right">
                        <p className="text-muted-foreground">BD</p>
                        <p className="font-medium">{item.dbStock}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-muted-foreground">Calc.</p>
                        <p className="font-medium">{item.calculatedStock}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        {item.difference > 0 ? (
                          <TrendingUp className="h-4 w-4 text-green-600" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-red-600" />
                        )}
                        <span className={`font-bold ${
                          item.difference > 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {item.difference > 0 ? '+' : ''}{item.difference}
                        </span>
                      </div>
                      <Badge variant={item.status === 'mismatch' ? 'destructive' : 'secondary'}>
                        {item.status === 'mismatch' ? 'Erro' : 'Aviso'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        ) : stats && issues.length === 0 && imbalances.length === 0 && (
          <div className="text-center py-8">
            <CheckCircle2 className="h-16 w-16 text-green-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-green-600">Sistema Íntegro!</h3>
            <p className="text-muted-foreground">
              Todos os {stats.totalProducts} produtos estão com o stock sincronizado corretamente.
            </p>
          </div>
        )}

        {/* Colis Imbalances Section */}
        {imbalances.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium flex items-center gap-2">
                <Layers className="h-4 w-4 text-orange-600" />
                Produtos com Colis Desbalanceados ({imbalances.length})
              </h3>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportImbalances}
              >
                <Download className="h-4 w-4 mr-2" />
                Exportar Colis Incompletos
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Produtos multi-colis onde as partes têm quantidades diferentes, impedindo a formação de sets completos.
            </p>
            <ScrollArea className="h-[400px] border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Sets Completos</TableHead>
                    <TableHead>Detalhe por Colis</TableHead>
                    <TableHead>Localização</TableHead>
                    <TableHead>Acção Sugerida</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {imbalances.map((item) => (
                    <TableRow key={item.productId}>
                      <TableCell className="font-mono font-medium">{item.code}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{item.name}</TableCell>
                      <TableCell>
                        <Badge className="bg-green-100 text-green-800">
                          {item.minQuantity} sets
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {item.colisQuantities.map((coli) => (
                            <Badge
                              key={coli.colisNumber}
                              variant="outline"
                              className={coli.excess > 0 
                                ? "bg-orange-50 text-orange-700 border-orange-300" 
                                : "bg-gray-50 text-gray-700"
                              }
                            >
                              C{coli.colisNumber}: {coli.quantity}
                              {coli.excess > 0 && (
                                <span className="ml-1 text-orange-600">+{coli.excess}</span>
                              )}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        {item.locations.length > 0 ? (
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-muted-foreground" />
                            <span className="text-sm">
                              {item.locations.length === 1 
                                ? item.locations[0] 
                                : `${item.locations.length} loc.`}
                            </span>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {item.colisQuantities
                            .filter(c => c.quantity === item.minQuantity && item.maxQuantity > item.minQuantity)
                            .map(c => `Coli ${c.colisNumber}`)
                            .slice(0, 2)
                            .join(', ')}
                          {item.colisQuantities.filter(c => c.quantity === item.minQuantity).length > 0 && (
                            <span> precisa +{item.maxQuantity - item.minQuantity}</span>
                          )}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        )}

        {isLoading && (
          <div className="text-center py-8">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">A verificar integridade...</p>
          </div>
        )}
      </CardContent>

      {/* Bulk Stock Correction Dialog */}
      <BulkStockCorrectionDialog
        open={showCorrectionDialog}
        onOpenChange={setShowCorrectionDialog}
        discrepancies={issues.map(item => ({
          productId: item.productId,
          code: item.code,
          name: item.name,
          totalColis: item.totalColis,
          dbStock: item.dbStock,
          calculatedStock: item.calculatedStock,
          difference: item.difference,
        }))}
        onSuccess={() => refetch()}
      />
    </Card>
  );
}
