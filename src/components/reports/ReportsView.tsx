import { useState, useMemo } from 'react';
import { useProducts } from '@/hooks/useProducts';
import { useSessions } from '@/hooks/useSessions';
import { useCounting } from '@/hooks/useCounting';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { FileDown, BarChart3, Package, AlertCircle, CheckCircle2, Tags, Filter } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';

export function ReportsView() {
  const { products, loading: productsLoading } = useProducts();
  const { sessions, loading: sessionsLoading } = useSessions();
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  
  const { getProductWithCounts, loading: countingLoading } = useCounting(selectedSessionId || null);

  const completedSessions = sessions.filter(s => s.status === 'completed' || s.status === 'active');

  const productsWithCounts = useMemo(() => {
    if (!selectedSessionId) return [];
    return products.map(p => getProductWithCounts(p));
  }, [products, selectedSessionId, getProductWithCounts]);

  const stats = useMemo(() => {
    const complete = productsWithCounts.filter(p => p.status === 'complete');
    const incomplete = productsWithCounts.filter(p => p.status === 'incomplete');
    const totalSets = productsWithCounts.reduce((sum, p) => sum + p.completeSets, 0);
    
    return {
      totalProducts: productsWithCounts.length,
      complete: complete.length,
      incomplete: incomplete.length,
      totalSets
    };
  }, [productsWithCounts]);

  const categoryStats = useMemo(() => {
    const categories = [...new Set(productsWithCounts.map(p => p.category))];
    return categories.map(category => {
      const categoryProducts = productsWithCounts.filter(p => p.category === category);
      const complete = categoryProducts.filter(p => p.status === 'complete').length;
      const incomplete = categoryProducts.filter(p => p.status === 'incomplete').length;
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

  const exportToCSV = () => {
    if (productsWithCounts.length === 0) return;

    const headers = ['Código', 'Nome', 'Categoria', 'Total Colis', 'Sets Completos', 'Unidades', 'Status', 'Colis Faltantes'];
    const rows = productsWithCounts.map(p => [
      p.code,
      p.name,
      p.category,
      p.total_colis,
      p.completeSets,
      p.status === 'complete' ? 1 : 0,
      p.status === 'complete' ? 'Completo' : p.status === 'incomplete' ? 'Incompleto' : p.status,
      p.incompleteColis.map(c => `Colis ${c.colis_number}`).join(', ') || '-'
    ]);

    // Calculate totals
    const totalUnits = productsWithCounts.filter(p => p.status === 'complete').length;
    const totalRow = ['', 'TOTAL', '', '', '', totalUnits, '', ''];

    const csv = [headers, ...rows, totalRow].map(row => row.join(';')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isLoading = productsLoading || sessionsLoading;

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

          {/* Category Stats */}
          {categoryStats.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Tags className="h-4 w-4" />
                  Estatísticas por Categoria
                </CardTitle>
              </CardHeader>
              <CardContent>
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
            </Card>
          )}

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
                      <TableHead>Total Colis</TableHead>
                      <TableHead>Sets Completos</TableHead>
                      <TableHead>Unidades</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Colis Faltantes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProducts.map(product => (
                      <TableRow key={product.id} className={product.status === 'incomplete' ? 'bg-red-50' : ''}>
                        <TableCell className="font-mono">{product.code}</TableCell>
                        <TableCell className="font-medium">{product.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{product.category}</Badge>
                        </TableCell>
                        <TableCell>{product.total_colis}</TableCell>
                        <TableCell className="font-bold">{product.completeSets}</TableCell>
                        <TableCell className="font-bold text-primary">
                          {product.status === 'complete' ? 1 : 0}
                        </TableCell>
                        <TableCell>
                          {product.status === 'complete' && (
                            <Badge className="bg-green-100 text-green-800">Completo</Badge>
                          )}
                          {product.status === 'incomplete' && (
                            <Badge variant="destructive">Incompleto</Badge>
                          )}
                          {product.status === 'excess' && (
                            <Badge className="bg-yellow-100 text-yellow-800">Excesso</Badge>
                          )}
                          {product.status === 'not_counted' && (
                            <Badge variant="secondary">Não contado</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-red-600">
                          {product.incompleteColis.length > 0 
                            ? product.incompleteColis.map(c => `Colis ${c.colis_number}`).join(', ')
                            : '-'
                          }
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
    </div>
  );
}
