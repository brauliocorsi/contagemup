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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { FileDown, BarChart3, Package, AlertCircle, CheckCircle2, Tags, Filter, MapPin, Box, ChevronDown, ChevronUp, Eye, PieChart } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { LocationStatsCard } from './LocationStatsCard';
import { ProductDetailsDialog } from './ProductDetailsDialog';
import { ReportsCharts } from './ReportsCharts';
import { StockMovementsReport } from './StockMovementsReport';
import { CountingMovementsReport } from './CountingMovementsReport';
import { ColisDispersionCard } from './ColisDispersionCard';
import { WarehouseMap } from './WarehouseMap';

export function ReportsView() {
  const { products, loading: productsLoading } = useProducts();
  const { sessions, loading: sessionsLoading } = useSessions();
  const { categories, loading: categoriesLoading } = useCategories();
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [categoryStatsOpen, setCategoryStatsOpen] = useState(true);
  const [locationStatsOpen, setLocationStatsOpen] = useState(true);
  const [chartsOpen, setChartsOpen] = useState(true);
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

    return {
      totalProducts: productsWithCounts.length,
      complete: withAnyComplete.length,
      incomplete: withPending.length,
      totalSets
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

  // Location stats
  const locationStats = useMemo(() => {
    const locations = [...new Set(productsWithCounts.map(p => p.location || 'Sem localização'))];
    return locations.map(location => {
      const locationProducts = productsWithCounts.filter(p => 
        (p.location || 'Sem localização') === location
      );
      const complete = locationProducts.filter(p => p.completeSets > 0 && !p.hasPartialProduct).length;
      const incomplete = locationProducts.filter(p => p.hasPartialProduct || (p.completeSets === 0 && p.status !== 'not_counted')).length;
      const totalSets = locationProducts.reduce((sum, p) => sum + p.completeSets, 0);
      
      return {
        location,
        products: locationProducts.map(p => ({
          id: p.id,
          code: p.code,
          name: p.name,
          category: p.category,
          completeSets: p.completeSets,
          hasPartialProduct: p.hasPartialProduct,
          status: p.status
        })),
        total: locationProducts.length,
        complete,
        incomplete,
        totalSets,
        isComplete: complete === locationProducts.length && locationProducts.length > 0 && incomplete === 0
      };
    }).sort((a, b) => a.location.localeCompare(b.location));
  }, [productsWithCounts]);

  const handleProductDetailsClick = (productId: string) => {
    const product = productsWithCounts.find(p => p.id === productId);
    if (product) {
      setSelectedProductForDetails(product);
      setProductDetailsOpen(true);
    }
  };

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
      const unidades = p.completeSets;
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
    const totalUnits = filteredProducts.reduce((sum, p) => sum + p.completeSets, 0);
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
      {/* Counting Movements Report */}
      <CountingMovementsReport />

      {/* Stock Movements Report */}
      <StockMovementsReport />

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Relatórios de Contagem</h2>
          <p className="text-sm text-muted-foreground">
            Análise de contagem por sessão
          </p>
        </div>
        
        <div className="flex gap-2">
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
            <Button onClick={exportToCSV}>
              <FileDown className="h-4 w-4 mr-2" />
              Exportar CSV
            </Button>
          )}
        </div>
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
          {/* Stats summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-primary/10 text-primary">
                    <Package className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats.totalProducts}</p>
                    <p className="text-xs text-muted-foreground">Total Produtos</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-green-100 text-green-600">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats.complete}</p>
                    <p className="text-xs text-muted-foreground">Completos</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-red-100 text-red-600">
                    <AlertCircle className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats.incomplete}</p>
                    <p className="text-xs text-muted-foreground">Incompletos</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-blue-100 text-blue-600">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats.totalSets}</p>
                    <p className="text-xs text-muted-foreground">Sets Completos</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts Section - Collapsible */}
          <Collapsible open={chartsOpen} onOpenChange={setChartsOpen}>
            <Card>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <PieChart className="h-4 w-4" />
                      Gráficos Visuais
                    </CardTitle>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      {chartsOpen ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0">
                  <ReportsCharts
                    productsWithCounts={productsWithCounts}
                    categoryStats={categoryStats}
                    locationStats={locationStats}
                  />
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* Warehouse Map */}
          <WarehouseMap
            productsWithCounts={productsWithCounts}
            onProductClick={handleProductDetailsClick}
          />

          {/* Category Stats - Collapsible */}
          {categoryStats.length > 0 && (
            <Collapsible open={categoryStatsOpen} onOpenChange={setCategoryStatsOpen}>
              <Card>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Tags className="h-4 w-4" />
                        Estatísticas por Categoria
                      </CardTitle>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        {categoryStatsOpen ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0">
                    <div className="space-y-4">
                      {categoryStats.map(cat => (
                        <div key={cat.category} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">{cat.category}</Badge>
                              <span className="text-sm text-muted-foreground">
                                {cat.total} produtos
                              </span>
                            </div>
                            <div className="flex items-center gap-4 text-sm">
                              <span className="text-green-600">{cat.complete} completos</span>
                              <span className="text-red-600">{cat.incomplete} incompletos</span>
                              <span className="text-blue-600">{cat.totalSets} sets</span>
                              <span className="font-bold">{cat.percentage}%</span>
                            </div>
                          </div>
                          <Progress value={cat.percentage} className="h-2" />
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          )}

          {/* Location Stats - Collapsible */}
          {locationStats.length > 0 && (
            <Collapsible open={locationStatsOpen} onOpenChange={setLocationStatsOpen}>
              <Card className="overflow-hidden">
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        Estatísticas por Localização
                      </CardTitle>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        {locationStatsOpen ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0">
                    <LocationStatsCard 
                      locationStats={locationStats} 
                      onProductClick={handleProductDetailsClick}
                    />
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          )}

          {/* Colis Dispersion Card */}
          <ColisDispersionCard
            productsWithCounts={productsWithCounts}
            categoryColisNamesMap={categoryColisNamesMap}
            onProductClick={handleProductDetailsClick}
          />

          {/* Products table */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <CardTitle className="text-base">Detalhes por Produto</CardTitle>
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Filtrar categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas ({productsWithCounts.length})</SelectItem>
                    {availableCategories.map(cat => (
                      <SelectItem key={cat} value={cat}>
                        {cat} ({productsWithCounts.filter(p => p.category === cat).length})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Localização</TableHead>
                      <TableHead>Nº Palete</TableHead>
                      <TableHead>Total Colis</TableHead>
                      <TableHead>Sets Completos</TableHead>
                      <TableHead>Unidades</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Colis Faltantes</TableHead>
                      <TableHead className="w-24">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProducts.map(product => (
                      <TableRow key={product.id} className={product.hasPartialProduct ? 'bg-red-50' : ''}>
                        <TableCell className="font-mono">{product.code}</TableCell>
                        <TableCell className="font-medium">{product.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{product.category}</Badge>
                        </TableCell>
                        <TableCell>
                          {product.location ? (
                            <span className="flex items-center gap-1 text-sm">
                              <MapPin className="h-3 w-3 text-muted-foreground" />
                              {product.location}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {product.palletNumber ? (
                            <span className="flex items-center gap-1 text-sm">
                              <Box className="h-3 w-3 text-muted-foreground" />
                              {product.palletNumber}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>{product.total_colis}</TableCell>
                        <TableCell className="font-bold">{product.completeSets}</TableCell>
                        <TableCell className="font-bold text-primary">{product.completeSets}</TableCell>
                        <TableCell>
                          {product.completeSets > 0 && !product.hasPartialProduct && (
                            <Badge className="bg-green-100 text-green-800">Completo</Badge>
                          )}
                          {product.completeSets > 0 && product.hasPartialProduct && (
                            <Badge className="bg-yellow-100 text-yellow-800">Completo + pendente</Badge>
                          )}
                          {product.completeSets === 0 && product.status !== 'not_counted' && (
                            <Badge variant="destructive">Incompleto</Badge>
                          )}
                          {product.status === 'not_counted' && (
                            <Badge variant="secondary">Não contado</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-red-600">
                          {formatMissingColis(product)}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8"
                            onClick={() => {
                              setSelectedProductForDetails(product);
                              setProductDetailsOpen(true);
                            }}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Ver
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Product Details Dialog */}
      <ProductDetailsDialog
        product={selectedProductForDetails}
        open={productDetailsOpen}
        onOpenChange={setProductDetailsOpen}
      />
    </div>
  );
}
