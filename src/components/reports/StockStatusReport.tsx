import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { 
  FileDown, 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle, 
  Package,
  Filter
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useProducts } from '@/hooks/useProducts';
import { useCategories } from '@/hooks/useCategories';
import { useDamages } from '@/hooks/useDamages';
import { useCounting } from '@/hooks/useCounting';
import { useActiveSession } from '@/hooks/useActiveSession';
import { loadXLSX } from '@/lib/lazyXlsx';
export function StockStatusReport() {
  const { products, loading: productsLoading } = useProducts();
  const { categories, loading: categoriesLoading } = useCategories();
  const { damages, loading: damagesLoading, getStats } = useDamages();
  const { activeSession } = useActiveSession();
  const { getProductWithCounts } = useCounting(activeSession?.id || null);
  
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [activeTab, setActiveTab] = useState('completos');

  // Create a map of category name to colis_names
  const categoryColisNamesMap = useMemo(() => {
    const map: Record<string, Record<string, string> | null> = {};
    categories.forEach(cat => {
      map[cat.name] = cat.colis_names;
    });
    return map;
  }, [categories]);

  // Get products with counts
  const productsWithCounts = useMemo(() => {
    return products.map(p => getProductWithCounts(p));
  }, [products, getProductWithCounts]);

  // Filter by category
  const filteredProducts = useMemo(() => {
    if (filterCategory === 'all') return productsWithCounts;
    return productsWithCounts.filter(p => p.category === filterCategory);
  }, [productsWithCounts, filterCategory]);

  // Complete products (have at least 1 complete set)
  const completeProducts = useMemo(() => {
    return filteredProducts.filter(p => p.completeSets > 0);
  }, [filteredProducts]);

  // Incomplete products (have partial/unbalanced colis)
  const incompleteProducts = useMemo(() => {
    return filteredProducts.filter(p => p.hasPartialProduct && p.missingForNextComplete.length > 0);
  }, [filteredProducts]);

  // Active damages
  const activeDamages = useMemo(() => {
    return damages.filter(d => d.status === 'active');
  }, [damages]);

  // Damage stats
  const damageStats = useMemo(() => getStats(), [getStats]);

  // Available categories
  const availableCategories = useMemo(() => {
    return [...new Set(products.map(p => p.category))].sort();
  }, [products]);

  // Helper to get colis name
  const getColisName = (category: string, colisNumber: number): string | null => {
    const colisNames = categoryColisNamesMap[category];
    if (!colisNames) return null;
    return colisNames[colisNumber.toString()] || null;
  };

  // Format missing colis with names
  const formatMissingColis = (product: typeof productsWithCounts[0]) => {
    if (product.missingForNextComplete.length === 0) return '-';
    
    return product.missingForNextComplete.map(c => {
      const name = getColisName(product.category, c.colis_number);
      if (name) return `${name} (-${c.missing})`;
      return `Coli ${c.colis_number} (-${c.missing})`;
    }).join(', ');
  };

  // Export all data
  const exportToExcel = async () => {
      const XLSX = await loadXLSX();
    const workbook = XLSX.utils.book_new();

    // Complete products sheet
    const completeData = completeProducts.map(p => ({
      'Código': p.code,
      'Nome': p.name,
      'Categoria': p.category,
      'Sets Completos': p.completeSets,
      'Total Unidades': p.counts.reduce((sum, c) => sum + c.quantity, 0),
      'Localizações': p.uniqueLocations.join(', ') || '-',
      'Paletes': p.uniquePallets.join(', ') || '-',
    }));
    const completeSheet = XLSX.utils.json_to_sheet(completeData);
    XLSX.utils.book_append_sheet(workbook, completeSheet, 'Completos');

    // Incomplete products sheet
    const incompleteData = incompleteProducts.map(p => ({
      'Código': p.code,
      'Nome': p.name,
      'Categoria': p.category,
      'Sets Mínimos': Math.min(...p.colisDetails.map(c => c.quantity)),
      'Sets Máximos': Math.max(...p.colisDetails.map(c => c.quantity)),
      'Colis em Falta': formatMissingColis(p),
      'Excedentes': p.totalExcessParts || 0,
    }));
    const incompleteSheet = XLSX.utils.json_to_sheet(incompleteData);
    XLSX.utils.book_append_sheet(workbook, incompleteSheet, 'Incompletos');

    // Damages sheet
    const damageData = activeDamages.map(d => ({
      'Data': format(new Date(d.created_at), 'dd/MM/yyyy'),
      'Código': d.product?.code || '',
      'Produto': d.product?.name || '',
      'Quantidade': d.quantity,
      'Tipo': d.damage_type,
      'Descrição': d.description || '',
      'Localização': d.location || '-',
      'Coli': d.colis_number || '-',
    }));
    const damageSheet = XLSX.utils.json_to_sheet(damageData);
    XLSX.utils.book_append_sheet(workbook, damageSheet, 'Avarias');

    XLSX.writeFile(workbook, `relatorio_stock_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const isLoading = productsLoading || categoriesLoading || damagesLoading;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <Package className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-2xl font-bold">{filteredProducts.length}</p>
              <p className="text-sm text-muted-foreground">Total Produtos</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-green-50 dark:bg-green-950/20">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <div>
              <p className="text-2xl font-bold text-green-700">{completeProducts.length}</p>
              <p className="text-sm text-muted-foreground">Completos</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-red-50 dark:bg-red-950/20">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <div>
              <p className="text-2xl font-bold text-red-700">{incompleteProducts.length}</p>
              <p className="text-sm text-muted-foreground">Incompletos</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-orange-50 dark:bg-orange-950/20">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-orange-600" />
            <div>
              <p className="text-2xl font-bold text-orange-700">{damageStats.totalActiveDamages}</p>
              <p className="text-sm text-muted-foreground">{damageStats.totalDamagedUnits} un. danificadas</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filters and Export */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-40">
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
        <Button onClick={exportToExcel}>
          <FileDown className="h-4 w-4 mr-2" />
          Exportar Excel
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="completos" className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Completos ({completeProducts.length})
          </TabsTrigger>
          <TabsTrigger value="incompletos" className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Incompletos ({incompleteProducts.length})
          </TabsTrigger>
          <TabsTrigger value="avarias" className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Avarias ({activeDamages.length})
          </TabsTrigger>
        </TabsList>

        {/* Complete Products */}
        <TabsContent value="completos">
          <Card>
            <CardContent className="p-0">
              <div className="rounded-md border max-h-[400px] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-center">Sets</TableHead>
                      <TableHead className="text-center">Unidades</TableHead>
                      <TableHead>Localizações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {completeProducts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          Nenhum produto completo encontrado.
                        </TableCell>
                      </TableRow>
                    ) : (
                      completeProducts.map(product => (
                        <TableRow key={product.id}>
                          <TableCell className="font-mono text-xs">{product.code}</TableCell>
                          <TableCell className="text-sm max-w-[200px] truncate">{product.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px]">{product.category}</Badge>
                          </TableCell>
                          <TableCell className="text-center font-bold text-green-600">
                            {product.completeSets}
                          </TableCell>
                          <TableCell className="text-center">
                            {product.counts.reduce((sum, c) => sum + c.quantity, 0)}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">
                            {product.uniqueLocations.join(', ') || '-'}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Incomplete Products */}
        <TabsContent value="incompletos">
          <Card>
            <CardContent className="p-0">
              <div className="rounded-md border max-h-[400px] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-center">Min/Max</TableHead>
                      <TableHead>Colis em Falta</TableHead>
                      <TableHead className="text-center">Excedentes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {incompleteProducts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          Nenhum produto incompleto encontrado.
                        </TableCell>
                      </TableRow>
                    ) : (
                      incompleteProducts.map(product => {
                        const minQty = Math.min(...product.colisDetails.map(c => c.quantity));
                        const maxQty = Math.max(...product.colisDetails.map(c => c.quantity));
                        return (
                          <TableRow key={product.id} className="bg-red-50/50 dark:bg-red-950/10">
                            <TableCell className="font-mono text-xs">{product.code}</TableCell>
                            <TableCell className="text-sm max-w-[200px] truncate">{product.name}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[10px]">{product.category}</Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <span className="text-red-600 font-medium">{minQty}</span>
                              <span className="text-muted-foreground mx-1">/</span>
                              <span className="text-green-600 font-medium">{maxQty}</span>
                            </TableCell>
                            <TableCell className="text-xs text-red-600 max-w-[200px]">
                              {formatMissingColis(product)}
                            </TableCell>
                            <TableCell className="text-center">
                              {product.totalExcessParts > 0 ? (
                                <Badge variant="secondary" className="text-[10px]">
                                  +{product.totalExcessParts}
                                </Badge>
                              ) : '-'}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Damages */}
        <TabsContent value="avarias">
          <Card>
            <CardContent className="p-0">
              <div className="rounded-md border max-h-[400px] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Código</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead className="text-center">Qtd</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Localização</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeDamages.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          Nenhuma avaria activa encontrada.
                        </TableCell>
                      </TableRow>
                    ) : (
                      activeDamages.map(damage => (
                        <TableRow key={damage.id} className="bg-orange-50/50 dark:bg-orange-950/10">
                          <TableCell className="text-xs">
                            {format(new Date(damage.created_at), 'dd/MM/yyyy')}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{damage.product?.code}</TableCell>
                          <TableCell className="text-sm max-w-[150px] truncate">{damage.product?.name}</TableCell>
                          <TableCell className="text-center font-bold text-orange-600">
                            {damage.quantity}
                          </TableCell>
                          <TableCell>
                            <Badge variant="destructive" className="text-[10px]">{damage.damage_type}</Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">
                            {damage.description || '-'}
                          </TableCell>
                          <TableCell className="text-xs">
                            {damage.location || '-'}
                            {damage.colis_number && (
                              <span className="text-muted-foreground ml-1">(C{damage.colis_number})</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
