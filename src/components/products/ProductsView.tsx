import { useState, useMemo } from 'react';
import { useProducts } from '@/hooks/useProducts';
import { useCategories } from '@/hooks/useCategories';
import { useProductChanges } from '@/hooks/useProductChanges';
import { useLastCounts } from '@/hooks/useLastCounts';
import { ProductForm } from './ProductForm';
import { ProductEditForm } from './ProductEditForm';
import { ProductHistoryDialog } from './ProductHistoryDialog';
import { ImportProducts } from './ImportProducts';
import { BulkMinStockDialog } from './BulkMinStockDialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, Trash2, Edit, Package, MapPin, Box, History, ClipboardList, Download, Filter, ArrowUpDown, ArrowUp, ArrowDown, Settings2, Columns3 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Product } from '@/types/stock';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { useQueryClient } from '@tanstack/react-query';

type ColumnKey = 'code' | 'name' | 'category' | 'colis' | 'stock' | 'lastCount' | 'location' | 'pallet';

const COLUMN_LABELS: Record<ColumnKey, string> = {
  code: 'Código',
  name: 'Nome',
  category: 'Categoria',
  colis: 'Colis',
  stock: 'Stock',
  lastCount: 'Última Contagem',
  location: 'Localização',
  pallet: 'Palete',
};

const DEFAULT_VISIBLE_COLUMNS: ColumnKey[] = ['code', 'name', 'category', 'colis', 'stock', 'lastCount', 'location', 'pallet'];

export function ProductsView() {
  const { products, loading, createProduct, updateProduct, deleteProduct, importProducts } = useProducts();
  const { categories, createCategory, refetch: refetchCategories } = useCategories();
  const { logChange, logMultipleChanges } = useProductChanges();
  const { lastCounts } = useLastCounts();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCountStatus, setFilterCountStatus] = useState<'all' | 'with_count' | 'without_count'>('all');
  const [filterStockStatus, setFilterStockStatus] = useState<'all' | 'in_stock' | 'low_stock' | 'out_of_stock'>('all');
  const [sortColumn, setSortColumn] = useState<'code' | 'name' | 'category' | 'stock' | 'lastCount' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [bulkMinStockOpen, setBulkMinStockOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(new Set(DEFAULT_VISIBLE_COLUMNS));

  const toggleColumn = (column: ColumnKey) => {
    setVisibleColumns(prev => {
      const newSet = new Set(prev);
      if (newSet.has(column)) {
        // Don't allow hiding all columns - keep at least name
        if (newSet.size > 1 || column === 'name') {
          newSet.delete(column);
        }
      } else {
        newSet.add(column);
      }
      return newSet;
    });
  };

  const isColumnVisible = (column: ColumnKey) => visibleColumns.has(column);

  const handleSort = (column: 'code' | 'name' | 'category' | 'stock' | 'lastCount') => {
    if (sortColumn === column) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        setSortColumn(null);
        setSortDirection('asc');
      }
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (column: 'code' | 'name' | 'category' | 'stock' | 'lastCount') => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="h-4 w-4 ml-1 opacity-50" />;
    }
    return sortDirection === 'asc' 
      ? <ArrowUp className="h-4 w-4 ml-1 text-primary" />
      : <ArrowDown className="h-4 w-4 ml-1 text-primary" />;
  };

  const getStockStatus = (stock: number, minStock: number = 5) => {
    if (stock <= 0) return 'out_of_stock';
    if (stock <= minStock) return 'low_stock';
    return 'in_stock';
  };

  const getStockBadge = (stock: number, minStock: number = 5) => {
    const status = getStockStatus(stock, minStock);
    
    // Stock zero - gray/neutral
    if (stock <= 0) {
      return (
        <Badge variant="outline" className="gap-1 bg-slate-100 text-slate-500 border-slate-300">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
          0 un.
        </Badge>
      );
    }
    
    // Low stock (below minimum) - yellow/warning
    if (status === 'low_stock') {
      return (
        <Badge variant="outline" className="gap-1 bg-yellow-50 text-yellow-700 border-yellow-300">
          <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
          {stock} un.
        </Badge>
      );
    }
    
    return (
      <Badge variant="outline" className="gap-1 bg-green-50 text-green-700 border-green-200">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
        {stock} un.
      </Badge>
    );
  };

  const existingCategoryNames = categories.map(c => c.name);

  const filteredProducts = useMemo(() => {
    let result = products.filter(product => {
      const matchesSearch = 
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.pallet_number?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const hasCount = !!lastCounts[product.id];
      const matchesCountStatus = 
        filterCountStatus === 'all' ||
        (filterCountStatus === 'with_count' && hasCount) ||
        (filterCountStatus === 'without_count' && !hasCount);

      const stockStatus = getStockStatus(product.current_stock, product.min_stock);
      const matchesStockStatus = 
        filterStockStatus === 'all' ||
        filterStockStatus === stockStatus;
      
      return matchesSearch && matchesCountStatus && matchesStockStatus;
    });

    // Apply sorting
    if (sortColumn) {
      result = [...result].sort((a, b) => {
        let comparison = 0;
        
        switch (sortColumn) {
          case 'code':
            comparison = a.code.localeCompare(b.code);
            break;
          case 'name':
            comparison = a.name.localeCompare(b.name);
            break;
          case 'category':
            comparison = a.category.localeCompare(b.category);
            break;
          case 'stock':
            comparison = a.current_stock - b.current_stock;
            break;
          case 'lastCount':
            const countA = lastCounts[a.id]?.totalQuantity ?? -1;
            const countB = lastCounts[b.id]?.totalQuantity ?? -1;
            comparison = countA - countB;
            break;
        }
        
        return sortDirection === 'asc' ? comparison : -comparison;
      });
    }
    
    return result;
  }, [products, searchTerm, filterCountStatus, filterStockStatus, lastCounts, sortColumn, sortDirection]);

  // Count stats for filter
  const countStats = useMemo(() => {
    const withCount = products.filter(p => !!lastCounts[p.id]).length;
    const withoutCount = products.length - withCount;
    return { withCount, withoutCount };
  }, [products, lastCounts]);

  // Stock stats for filter
  const stockStats = useMemo(() => {
    const inStock = products.filter(p => getStockStatus(p.current_stock, p.min_stock) === 'in_stock').length;
    const lowStock = products.filter(p => getStockStatus(p.current_stock, p.min_stock) === 'low_stock').length;
    const outOfStock = products.filter(p => getStockStatus(p.current_stock, p.min_stock) === 'out_of_stock').length;
    return { inStock, lowStock, outOfStock };
  }, [products]);

  const exportLastCounts = () => {
    const headers = ['Código', 'Nome', 'Categoria', 'Localização', 'Palete', 'Última Quantidade', 'Sessão', 'Data Contagem'];
    const rows = filteredProducts.map(product => {
      const lastCount = lastCounts[product.id];
      return [
        product.code,
        product.name,
        product.category,
        product.location || '',
        product.pallet_number || '',
        lastCount?.totalQuantity?.toString() || '0',
        lastCount?.sessionName || '-',
        lastCount?.countedAt 
          ? format(new Date(lastCount.countedAt), 'dd/MM/yyyy HH:mm', { locale: pt })
          : '-'
      ];
    });
    
    const csvContent = [
      headers.join(';'),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(';'))
    ].join('\n');
    
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `ultima_contagem_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.csv`;
    link.click();
  };

  // Selection handlers
  const toggleProductSelection = (productId: string) => {
    setSelectedProducts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(productId)) {
        newSet.delete(productId);
      } else {
        newSet.add(productId);
      }
      return newSet;
    });
  };

  const toggleAllSelection = () => {
    if (selectedProducts.size === filteredProducts.length) {
      setSelectedProducts(new Set());
    } else {
      setSelectedProducts(new Set(filteredProducts.map(p => p.id)));
    }
  };

  const clearSelection = () => {
    setSelectedProducts(new Set());
  };

  const handleBulkMinStockSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['products'] });
    clearSelection();
  };

  const handleCreateProduct = async (product: { code: string; name: string; category: string; total_colis: number; description: string | null; location: string | null; pallet_number: string | null }) => {
    const result = await createProduct(product);
    if (result) {
      await logChange(result.id, 'created');
    }
    return !!result;
  };

  const handleCreateCategory = async (name: string): Promise<boolean> => {
    const result = await createCategory(name);
    if (result) {
      await refetchCategories();
      return true;
    }
    return false;
  };

  const handleUpdateProduct = async (id: string, updates: Partial<Product>): Promise<boolean> => {
    // Find the original product to compare changes
    const originalProduct = products.find(p => p.id === id);
    
    const success = await updateProduct(id, updates);
    
    if (success && originalProduct) {
      // Log each changed field
      const changes: Array<{ field: string; oldValue: string | number | null; newValue: string | number | null }> = [];
      
      if (updates.code !== undefined && updates.code !== originalProduct.code) {
        changes.push({ field: 'code', oldValue: originalProduct.code, newValue: updates.code });
      }
      if (updates.name !== undefined && updates.name !== originalProduct.name) {
        changes.push({ field: 'name', oldValue: originalProduct.name, newValue: updates.name });
      }
      if (updates.category !== undefined && updates.category !== originalProduct.category) {
        changes.push({ field: 'category', oldValue: originalProduct.category, newValue: updates.category });
      }
      if (updates.total_colis !== undefined && updates.total_colis !== originalProduct.total_colis) {
        changes.push({ field: 'total_colis', oldValue: originalProduct.total_colis, newValue: updates.total_colis });
      }
      if (updates.description !== undefined && updates.description !== originalProduct.description) {
        changes.push({ field: 'description', oldValue: originalProduct.description, newValue: updates.description });
      }
      if (updates.location !== undefined && updates.location !== originalProduct.location) {
        changes.push({ field: 'location', oldValue: originalProduct.location, newValue: updates.location });
      }
      if (updates.pallet_number !== undefined && updates.pallet_number !== originalProduct.pallet_number) {
        changes.push({ field: 'pallet_number', oldValue: originalProduct.pallet_number, newValue: updates.pallet_number });
      }
      
      if (changes.length > 0) {
        await logMultipleChanges(id, changes);
      }
    }
    
    return success;
  };

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-10 w-full max-w-md" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Gestão de Produtos</h2>
          <p className="text-sm text-muted-foreground">
            {products.length} produtos cadastrados
          </p>
        </div>
        <div className="flex gap-2">
          <ImportProducts 
            onImport={importProducts} 
            existingCategories={existingCategoryNames}
            onCreateCategory={handleCreateCategory}
          />
          <ProductForm onSubmit={handleCreateProduct} />
        </div>
      </div>

      {/* Search and filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar por nome, código, localização ou palete..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={filterCountStatus} onValueChange={(v) => setFilterCountStatus(v as typeof filterCountStatus)}>
          <SelectTrigger className={`w-full sm:w-52 transition-colors ${filterCountStatus !== 'all' ? 'border-primary bg-primary/10 text-primary' : ''}`}>
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Contagem" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas contagens</SelectItem>
            <SelectItem value="with_count">Com contagem ({countStats.withCount})</SelectItem>
            <SelectItem value="without_count">Sem contagem ({countStats.withoutCount})</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStockStatus} onValueChange={(v) => setFilterStockStatus(v as typeof filterStockStatus)}>
          <SelectTrigger className={`w-full sm:w-48 transition-colors ${filterStockStatus !== 'all' ? 'border-primary bg-primary/10 text-primary' : ''}`}>
            <Package className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Stock" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todo stock</SelectItem>
            <SelectItem value="in_stock">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                Em stock ({stockStats.inStock})
              </span>
            </SelectItem>
            <SelectItem value="low_stock">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-yellow-500" />
                Stock baixo ({stockStats.lowStock})
              </span>
            </SelectItem>
            <SelectItem value="out_of_stock">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                Esgotado ({stockStats.outOfStock})
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={exportLastCounts} className="whitespace-nowrap">
          <Download className="h-4 w-4 mr-2" />
          Exportar
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="whitespace-nowrap">
              <Columns3 className="h-4 w-4 mr-2" />
              Colunas
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56" align="end">
            <div className="space-y-2">
              <p className="text-sm font-medium mb-3">Colunas visíveis</p>
              {(Object.keys(COLUMN_LABELS) as ColumnKey[]).map((column) => (
                <div key={column} className="flex items-center space-x-2">
                  <Checkbox
                    id={`col-${column}`}
                    checked={isColumnVisible(column)}
                    onCheckedChange={() => toggleColumn(column)}
                  />
                  <label
                    htmlFor={`col-${column}`}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    {COLUMN_LABELS[column]}
                  </label>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Selection action bar */}
      {selectedProducts.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-primary/10 border border-primary/20 rounded-lg">
          <span className="text-sm font-medium">
            {selectedProducts.size} produto(s) selecionado(s)
          </span>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBulkMinStockOpen(true)}
          >
            <Settings2 className="h-4 w-4 mr-2" />
            Definir Stock Mínimo
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearSelection}
          >
            Limpar seleção
          </Button>
        </div>
      )}

      {/* Products table */}
      {products.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold mb-2">Nenhum produto cadastrado</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Adicione produtos manualmente ou importe um ficheiro CSV
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedProducts.size === filteredProducts.length && filteredProducts.length > 0}
                        onCheckedChange={toggleAllSelection}
                        aria-label="Selecionar todos"
                      />
                    </TableHead>
                    {isColumnVisible('code') && (
                      <TableHead 
                        className="cursor-pointer hover:bg-muted/50 select-none"
                        onClick={() => handleSort('code')}
                      >
                        <span className="flex items-center">
                          Código
                          {getSortIcon('code')}
                        </span>
                      </TableHead>
                    )}
                    {isColumnVisible('name') && (
                      <TableHead 
                        className="cursor-pointer hover:bg-muted/50 select-none"
                        onClick={() => handleSort('name')}
                      >
                        <span className="flex items-center">
                          Nome
                          {getSortIcon('name')}
                        </span>
                      </TableHead>
                    )}
                    {isColumnVisible('category') && (
                      <TableHead 
                        className="cursor-pointer hover:bg-muted/50 select-none"
                        onClick={() => handleSort('category')}
                      >
                        <span className="flex items-center">
                          Categoria
                          {getSortIcon('category')}
                        </span>
                      </TableHead>
                    )}
                    {isColumnVisible('colis') && <TableHead>Colis</TableHead>}
                    {isColumnVisible('stock') && (
                      <TableHead 
                        className="cursor-pointer hover:bg-muted/50 select-none"
                        onClick={() => handleSort('stock')}
                      >
                        <span className="flex items-center">
                          Stock
                          {getSortIcon('stock')}
                        </span>
                      </TableHead>
                    )}
                    {isColumnVisible('lastCount') && (
                      <TableHead 
                        className="cursor-pointer hover:bg-muted/50 select-none"
                        onClick={() => handleSort('lastCount')}
                      >
                        <span className="flex items-center">
                          Última Contagem
                          {getSortIcon('lastCount')}
                        </span>
                      </TableHead>
                    )}
                    {isColumnVisible('location') && <TableHead>Localização</TableHead>}
                    {isColumnVisible('pallet') && <TableHead>Palete</TableHead>}
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                {filteredProducts.map(product => {
                    const lastCount = lastCounts[product.id];
                    return (
                    <TableRow key={product.id} className={selectedProducts.has(product.id) ? 'bg-primary/5' : ''}>
                      <TableCell>
                        <Checkbox
                          checked={selectedProducts.has(product.id)}
                          onCheckedChange={() => toggleProductSelection(product.id)}
                          aria-label={`Selecionar ${product.name}`}
                        />
                      </TableCell>
                      {isColumnVisible('code') && (
                        <TableCell className="font-mono">{product.code}</TableCell>
                      )}
                      {isColumnVisible('name') && (
                        <TableCell className="font-medium max-w-[200px] truncate" title={product.name}>{product.name}</TableCell>
                      )}
                      {isColumnVisible('category') && (
                        <TableCell>
                          <Badge variant="outline">{product.category}</Badge>
                        </TableCell>
                      )}
                      {isColumnVisible('colis') && (
                        <TableCell>
                          <Badge variant="secondary">{product.total_colis}</Badge>
                        </TableCell>
                      )}
                      {isColumnVisible('stock') && (
                        <TableCell>
                          {getStockBadge(product.current_stock, product.min_stock)}
                        </TableCell>
                      )}
                      {isColumnVisible('lastCount') && (
                        <TableCell>
                          {lastCount ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="flex items-center gap-1 cursor-help">
                                    <ClipboardList className="h-3 w-3 text-muted-foreground" />
                                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                      {lastCount.totalQuantity} un.
                                    </Badge>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="font-medium">{lastCount.sessionName}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {format(new Date(lastCount.countedAt), "dd MMM yyyy 'às' HH:mm", { locale: pt })}
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </TableCell>
                      )}
                      {isColumnVisible('location') && (
                        <TableCell>
                          {product.location ? (
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <MapPin className="h-3 w-3" />
                              {product.location}
                            </span>
                          ) : '-'}
                        </TableCell>
                      )}
                      {isColumnVisible('pallet') && (
                        <TableCell>
                          {product.pallet_number ? (
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <Box className="h-3 w-3" />
                              {product.pallet_number}
                            </span>
                          ) : '-'}
                        </TableCell>
                      )}
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => setHistoryProduct(product)}
                            title="Ver histórico"
                          >
                            <History className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => setEditingProduct(product)}
                            title="Editar"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" title="Eliminar">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Eliminar produto?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Esta ação não pode ser revertida. O produto "{product.name}" será permanentemente eliminado.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteProduct(product.id)}>
                                  Eliminar
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {filteredProducts.length === 0 && products.length > 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <p>Nenhum produto encontrado para "{searchTerm}"</p>
        </div>
      )}

      {/* Edit Product Dialog */}
      {editingProduct && (
        <ProductEditForm
          product={editingProduct}
          open={!!editingProduct}
          onOpenChange={(open) => !open && setEditingProduct(null)}
          onSubmit={handleUpdateProduct}
        />
      )}

      {/* Product History Dialog */}
      {historyProduct && (
        <ProductHistoryDialog
          productId={historyProduct.id}
          productName={historyProduct.name}
          open={!!historyProduct}
          onOpenChange={(open) => !open && setHistoryProduct(null)}
        />
      )}

      {/* Bulk Min Stock Dialog */}
      <BulkMinStockDialog
        open={bulkMinStockOpen}
        onOpenChange={setBulkMinStockOpen}
        selectedProductIds={Array.from(selectedProducts)}
        onSuccess={handleBulkMinStockSuccess}
      />
    </div>
  );
}
