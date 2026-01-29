import { useState, useMemo } from 'react';
import { useProducts } from '@/hooks/useProducts';
import { useSessions } from '@/hooks/useSessions';
import { useCounting } from '@/hooks/useCounting';
import { useCategories } from '@/hooks/useCategories';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileDown, BarChart3, Package, AlertCircle, CheckCircle2, Tags, Filter, MapPin, Box, Eye, Activity, ClipboardList, ShieldCheck } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { ProductDetailsDialog } from './ProductDetailsDialog';
import { StockMovementsReport } from './StockMovementsReport';
import { CountingMovementsReport } from './CountingMovementsReport';
import { StockIntegrityReport } from './StockIntegrityReport';

export function ReportsView() {
  const { products, loading: productsLoading } = useProducts();
  const { sessions, loading: sessionsLoading } = useSessions();
  const { categories, loading: categoriesLoading } = useCategories();
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [selectedProductForDetails, setSelectedProductForDetails] = useState<any>(null);
  const [productDetailsOpen, setProductDetailsOpen] = useState(false);
  
  const { getProductWithCounts, loading: countingLoading } = useCounting(selectedSessionId || null);

  // Create a map of category name to colis_names for quick lookup
  const categoryColisNamesMap = useMemo(() => {
    const map: Record<string, Record<string, string> | null> = {};
    categories.forEach(cat => {
      map[cat.name] = cat.colis_names;
    });
    return map;
  }, [categories]);

  const completedSessions = sessions.filter(s => s.status === 'completed' || s.status === 'active');

  const productsWithCounts = useMemo(() => {
    if (!selectedSessionId) return [];
    return products.map(p => getProductWithCounts(p));
  }, [products, selectedSessionId, getProductWithCounts]);

  const stats = useMemo(() => {
    const withAnyComplete = productsWithCounts.filter(p => p.completeSets > 0);
    const withPending = productsWithCounts.filter(p => p.hasPartialProduct);
    const totalSets = productsWithCounts.reduce((sum, p) => sum + p.completeSets, 0);
    const totalUnits = productsWithCounts.reduce((sum, p) => {
      // Sum all colis quantities
      return sum + p.counts.reduce((countSum, c) => countSum + c.quantity, 0);
    }, 0);

    return {
      totalProducts: productsWithCounts.length,
      complete: withAnyComplete.length,
      incomplete: withPending.length,
      totalSets,
      totalUnits
    };
  }, [productsWithCounts]);

  const categoryStats = useMemo(() => {
    const categories = [...new Set(productsWithCounts.map(p => p.category))];
    return categories.map(category => {
      const categoryProducts = productsWithCounts.filter(p => p.category === category);
      const complete = categoryProducts.filter(p => p.completeSets > 0).length;
      const incomplete = categoryProducts.filter(p => p.hasPartialProduct).length;
      const totalSets = categoryProducts.reduce((sum, p) => sum + p.completeSets, 0);
      
      return {
        category,
        total: categoryProducts.length,
        complete,
        incomplete,
        totalSets,
        percentage: categoryProducts.length > 0 ? Math.round((complete / categoryProducts.length) * 100) : 0
      };
    }).sort((a, b) => a.category.localeCompare(b.category));
  }, [productsWithCounts]);

  const availableCategories = useMemo(() => {
    return [...new Set(productsWithCounts.map(p => p.category))].sort();
  }, [productsWithCounts]);

  const filteredProducts = useMemo(() => {
    if (filterCategory === 'all') return productsWithCounts;
    return productsWithCounts.filter(p => p.category === filterCategory);
  }, [productsWithCounts, filterCategory]);

  // Helper to get colis name
  const getColisName = (category: string, colisNumber: number): string | null => {
    const colisNames = categoryColisNamesMap[category];
    if (!colisNames) return null;
    return colisNames[colisNumber.toString()] || null;
  };

  // Format missing colis with names
  const formatMissingColis = (product: typeof productsWithCounts[0]) => {
    if (!product.hasPartialProduct || product.missingForNextComplete.length === 0) {
      return '-';
    }
    
    return product.missingForNextComplete.map(c => {
      const name = getColisName(product.category, c.colis_number);
      if (name) {
        return `${name} (-${c.missing})`;
      }
      return `Coli ${c.colis_number} (-${c.missing})`;
    }).join(', ');
  };

  const exportToCSV = () => {
    if (filteredProducts.length === 0) return;

    const headers = ['Código', 'Nome', 'Categoria', 'Localização', 'Nº Palete', 'Total Colis', 'Sets Completos', 'Unidades', 'Status', 'Colis Faltantes'];
    const rows = filteredProducts.map(p => {
      const unidades = p.counts.reduce((sum, c) => sum + c.quantity, 0);
      const statusLabel = p.completeSets > 0
        ? (p.hasPartialProduct ? 'Completo + pendente' : 'Completo')
        : (p.status === 'not_counted' ? 'Não contado' : 'Incompleto');

      const faltantes = formatMissingColis(p);

      return [
        p.code,
        p.name,
        p.category,
        p.location || '-',
        p.palletNumber || '-',
        p.total_colis,
        p.completeSets,
        unidades,
        statusLabel,
        faltantes
      ];
    });

    // Calculate totals
    const totalUnits = filteredProducts.reduce((sum, p) => sum + p.counts.reduce((s, c) => s + c.quantity, 0), 0);
    const totalRow = ['', 'TOTAL', '', '', '', '', '', totalUnits, '', ''];

    const csv = [headers, ...rows, totalRow].map(row => row.join(';')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const categorySuffix = filterCategory !== 'all' ? `_${filterCategory}` : '';
    a.download = `relatorio${categorySuffix}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isLoading = productsLoading || sessionsLoading || categoriesLoading;

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Relatórios</h2>
          <p className="text-sm text-muted-foreground">
            Análise e integridade de stock
          </p>
        </div>
      </div>

      <Tabs defaultValue="integrity" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="integrity" className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            <span className="hidden sm:inline">Integridade</span>
          </TabsTrigger>
          <TabsTrigger value="movements" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            <span className="hidden sm:inline">Movimentos</span>
          </TabsTrigger>
          <TabsTrigger value="counting" className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            <span className="hidden sm:inline">Contagem</span>
          </TabsTrigger>
          <TabsTrigger value="session" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Sessão</span>
          </TabsTrigger>
        </TabsList>

        {/* Integridade Tab */}
        <TabsContent value="integrity" className="space-y-4">
          <StockIntegrityReport />
        </TabsContent>

        {/* Movimentos Tab */}
        <TabsContent value="movements" className="space-y-4">
          <StockMovementsReport />
        </TabsContent>

        {/* Contagem Tab */}
        <TabsContent value="counting" className="space-y-4">
          <CountingMovementsReport />
        </TabsContent>

        {/* Sessão Tab */}
        <TabsContent value="session" className="space-y-4">
          <div className="flex gap-2 items-center">
            <Select value={selectedSessionId} onValueChange={setSelectedSessionId}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Selecionar sessão" />
              </SelectTrigger>
              <SelectContent>
                {completedSessions.map(session => (
                  <SelectItem key={session.id} value={session.id}>
                    {session.name} ({session.status === 'active' ? 'Ativa' : 'Completada'})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedSessionId && (
              <Button onClick={exportToCSV} variant="outline">
                <FileDown className="h-4 w-4 mr-2" />
                Exportar
              </Button>
            )}
          </div>

          {!selectedSessionId ? (
            <Card>
              <CardContent className="py-12 text-center">
                <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-semibold mb-2">Selecione uma sessão</h3>
                <p className="text-muted-foreground text-sm">
                  Escolha uma sessão para ver o relatório de contagem
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Stats summary - mais compacto */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <Card className="p-3">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-lg font-bold">{stats.totalProducts}</p>
                      <p className="text-xs text-muted-foreground">Produtos</p>
                    </div>
                  </div>
                </Card>
                <Card className="p-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <div>
                      <p className="text-lg font-bold text-green-600">{stats.complete}</p>
                      <p className="text-xs text-muted-foreground">Completos</p>
                    </div>
                  </div>
                </Card>
                <Card className="p-3">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-red-600" />
                    <div>
                      <p className="text-lg font-bold text-red-600">{stats.incomplete}</p>
                      <p className="text-xs text-muted-foreground">Incompletos</p>
                    </div>
                  </div>
                </Card>
                <Card className="p-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-blue-600" />
                    <div>
                      <p className="text-lg font-bold text-blue-600">{stats.totalSets}</p>
                      <p className="text-xs text-muted-foreground">Sets</p>
                    </div>
                  </div>
                </Card>
                <Card className="p-3">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-lg font-bold text-primary">{stats.totalUnits}</p>
                      <p className="text-xs text-muted-foreground">Unidades</p>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Category Stats - compact */}
              {categoryStats.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Tags className="h-4 w-4" />
                      Por Categoria
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-2">
                      {categoryStats.map(cat => (
                        <div key={cat.category} className="flex items-center gap-3">
                          <Badge variant="outline" className="min-w-20 justify-center">{cat.category}</Badge>
                          <Progress value={cat.percentage} className="h-2 flex-1" />
                          <span className="text-xs text-muted-foreground min-w-16 text-right">
                            {cat.complete}/{cat.total}
                          </span>
                          <span className="text-xs font-medium min-w-10 text-right">{cat.percentage}%</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Products table - simplificado */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm">Produtos</CardTitle>
                  <div className="flex items-center gap-2">
                    <Filter className="h-3 w-3 text-muted-foreground" />
                    <Select value={filterCategory} onValueChange={setFilterCategory}>
                      <SelectTrigger className="w-32 h-8 text-xs">
                        <SelectValue placeholder="Categoria" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        {availableCategories.map(cat => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto max-h-96">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Código</TableHead>
                          <TableHead className="text-xs">Nome</TableHead>
                          <TableHead className="text-xs">Categoria</TableHead>
                          <TableHead className="text-xs">Sets</TableHead>
                          <TableHead className="text-xs">Unidades</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                          <TableHead className="text-xs w-16">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredProducts.map(product => {
                          const totalUnits = product.counts.reduce((sum, c) => sum + c.quantity, 0);
                          return (
                            <TableRow key={product.id} className={product.hasPartialProduct ? 'bg-red-50/50' : ''}>
                              <TableCell className="font-mono text-xs">{product.code}</TableCell>
                              <TableCell className="text-xs font-medium max-w-48 truncate">{product.name}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-[10px]">{product.category}</Badge>
                              </TableCell>
                              <TableCell className="font-bold text-xs">{product.completeSets}</TableCell>
                              <TableCell className="font-bold text-xs text-primary">{totalUnits}</TableCell>
                              <TableCell>
                                {product.completeSets > 0 && !product.hasPartialProduct && (
                                  <Badge className="bg-green-100 text-green-800 text-[10px]">OK</Badge>
                                )}
                                {product.completeSets > 0 && product.hasPartialProduct && (
                                  <Badge className="bg-yellow-100 text-yellow-800 text-[10px]">Parcial</Badge>
                                )}
                                {product.completeSets === 0 && product.status !== 'not_counted' && (
                                  <Badge variant="destructive" className="text-[10px]">Inc.</Badge>
                                )}
                                {product.status === 'not_counted' && (
                                  <Badge variant="secondary" className="text-[10px]">N/C</Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0"
                                  onClick={() => {
                                    setSelectedProductForDetails(product);
                                    setProductDetailsOpen(true);
                                  }}
                                >
                                  <Eye className="h-3 w-3" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Product Details Dialog */}
      <ProductDetailsDialog
        product={selectedProductForDetails}
        open={productDetailsOpen}
        onOpenChange={setProductDetailsOpen}
      />
    </div>
  );
}
