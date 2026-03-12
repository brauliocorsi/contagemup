import { useState, useMemo, useRef, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useProducts } from '@/hooks/useProducts';
import { useCategories } from '@/hooks/useCategories';
import { useProductChanges } from '@/hooks/useProductChanges';
import { useLastCounts } from '@/hooks/useLastCounts';
import { useProductsWithOrders } from '@/hooks/useProductsWithOrders';
import { useProductSales } from '@/hooks/useProductSales';
import { useToast } from '@/hooks/use-toast';
import { ProductForm } from './ProductForm';
import { ProductEditForm } from './ProductEditForm';
import { ProductHistoryDialog } from './ProductHistoryDialog';
import { ProductMovementHistoryDialog } from './ProductMovementHistoryDialog';
import { ProductColisDetailsDialog } from './ProductColisDetailsDialog';
import { ImportProducts } from './ImportProducts';
import { BulkMinStockDialog } from './BulkMinStockDialog';
import { VirtualizedProductRow } from './VirtualizedProductRow';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, Trash2, Edit, Package, MapPin, Box, History, ClipboardList, Download, Filter, ArrowUpDown, ArrowUp, ArrowDown, Settings2, Columns3, Eye, Warehouse, Split, AlertTriangle, CheckCircle, ArrowRightLeft, ShoppingBag, FileText, FileSpreadsheet, ShieldCheck } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Product } from '@/types/stock';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';

const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  checkbox: 48,
  code: 120,
  name: 200,
  category: 120,
  colis: 80,
  stock: 100,
  damages: 100,
  totalUnits: 100,
  lastCount: 140,
  colisLocations: 180,
  location: 120,
  pallet: 100,
  sales: 100,
  actions: 120,
};

type ColumnKey = 'code' | 'name' | 'category' | 'colis' | 'stock' | 'damages' | 'totalUnits' | 'lastCount' | 'colisLocations' | 'location' | 'pallet';

const COLUMN_LABELS: Record<ColumnKey, string> = {
  code: 'Código',
  name: 'Nome',
  category: 'Categoria',
  colis: 'Colis',
  stock: 'Stock (Sets)',
  damages: 'Avarias',
  totalUnits: 'Total Unidades',
  lastCount: 'Última Contagem',
  colisLocations: 'Colis/Localização',
  location: 'Localização',
  pallet: 'Palete',
};

const DEFAULT_VISIBLE_COLUMNS: ColumnKey[] = ['code', 'name', 'category', 'colis', 'stock', 'damages', 'totalUnits', 'lastCount', 'colisLocations', 'location', 'pallet'];

export function ProductsView() {
  const { products, loading, createProduct, updateProduct, deleteProduct, importProducts } = useProducts();
  const { categories, createCategory, refetch: refetchCategories } = useCategories();
  const { logChange, logMultipleChanges } = useProductChanges();
  const { lastCounts } = useLastCounts();
  const { productIdsWithOrders, getOrderStats, loading: ordersLoading } = useProductsWithOrders();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCountStatus, setFilterCountStatus] = useState<'all' | 'with_count' | 'without_count'>('all');
  const [filterStockStatus, setFilterStockStatus] = useState<'all' | 'in_stock' | 'low_stock' | 'out_of_stock'>('all');
  const [filterOrderStatus, setFilterOrderStatus] = useState<'all' | 'with_orders' | 'without_orders'>('all');
  const [sortColumn, setSortColumn] = useState<'code' | 'name' | 'category' | 'stock' | 'lastCount' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);
  const [movementHistoryProduct, setMovementHistoryProduct] = useState<Product | null>(null);
  const [detailsProduct, setDetailsProduct] = useState<Product | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [bulkMinStockOpen, setBulkMinStockOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(new Set(DEFAULT_VISIBLE_COLUMNS));

  // Ref for virtualization
  const parentRef = useRef<HTMLDivElement>(null);

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

      // Filter by order status
      const hasOrders = productIdsWithOrders.has(product.id);
      const matchesOrderStatus =
        filterOrderStatus === 'all' ||
        (filterOrderStatus === 'with_orders' && hasOrders) ||
        (filterOrderStatus === 'without_orders' && !hasOrders);
      
      return matchesSearch && matchesCountStatus && matchesStockStatus && matchesOrderStatus;
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
  }, [products, searchTerm, filterCountStatus, filterStockStatus, filterOrderStatus, lastCounts, productIdsWithOrders, sortColumn, sortDirection]);

  // Virtualizer for products table
  const rowVirtualizer = useVirtualizer({
    count: filteredProducts.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 60,
    overscan: 5,
  });

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

  // Order stats for filter
  const orderStats = useMemo(() => {
    const withOrders = products.filter(p => productIdsWithOrders.has(p.id)).length;
    const withoutOrders = products.length - withOrders;
    return { withOrders, withoutOrders };
  }, [products, productIdsWithOrders]);

  // Export helpers
  const exportToExcel = useCallback((data: (string | number)[][], filename: string, sheetName: string = 'Relatório') => {
    const worksheet = XLSX.utils.aoa_to_sheet(data);
    const colWidths = data[0].map((_, colIndex) => {
      const maxLength = Math.max(...data.map(row => String(row[colIndex] || '').length));
      return { wch: Math.min(Math.max(maxLength + 2, 10), 50) };
    });
    worksheet['!cols'] = colWidths;
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, filename);
  }, []);

  const productHeaders = ['Código', 'Nome', 'Categoria', 'Localização', 'Palete', 'Colis/Set', 'Stock (Sets)', 'Avarias', 'Última Contagem', 'Sessão', 'Data Contagem'];

  const buildProductRow = useCallback((product: Product) => {
    const lastCount = lastCounts[product.id];
    return [
      product.code,
      product.name,
      product.category,
      product.location || '-',
      product.pallet_number || '-',
      product.total_colis,
      product.current_stock,
      product.damaged_stock || 0,
      lastCount?.totalQuantity ?? 0,
      lastCount?.sessionName || '-',
      lastCount?.countedAt ? format(new Date(lastCount.countedAt), 'dd/MM/yyyy HH:mm', { locale: pt }) : '-'
    ];
  }, [lastCounts]);

  const productsWithDamagesCount = useMemo(() => filteredProducts.filter(p => (p.damaged_stock || 0) > 0).length, [filteredProducts]);
  const productsWithoutDamagesCount = useMemo(() => filteredProducts.filter(p => (p.damaged_stock || 0) === 0).length, [filteredProducts]);

  const exportProductsCSV = useCallback((prods: Product[], filename: string) => {
    if (prods.length === 0) { toast({ title: 'Nenhum produto para exportar' }); return; }
    const rows = prods.map(buildProductRow);
    const csvContent = [productHeaders.join(';'), ...rows.map(row => row.map(cell => `"${cell}"`).join(';'))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast({ title: 'Exportação concluída', description: `${prods.length} produtos exportados` });
  }, [buildProductRow, toast]);

  const exportProductsExcel = useCallback((prods: Product[], filename: string, sheetName: string) => {
    if (prods.length === 0) { toast({ title: 'Nenhum produto para exportar' }); return; }
    const rows = prods.map(buildProductRow);
    exportToExcel([productHeaders, ...rows], `${filename}_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.xlsx`, sheetName);
    toast({ title: 'Exportação concluída', description: `${prods.length} produtos exportados para Excel` });
  }, [buildProductRow, exportToExcel, toast]);

  const exportIncompleteProducts = () => {
    const incompleteProducts = products
      .map(product => {
        const lastCount = lastCounts[product.id];
        if (!lastCount || product.total_colis <= 1) return null;
        const colisDistribution = lastCount.colisLocations.map(c => ({ colisNumber: c.colisNumber, quantity: c.quantity }));
        const totalUnits = colisDistribution.reduce((sum, c) => sum + c.quantity, 0);
        const completeSets = product.current_stock;
        const unitsInCompleteSets = completeSets * product.total_colis;
        const incompleteUnits = totalUnits - unitsInCompleteSets;
        if (incompleteUnits <= 0) return null;
        const colisDetail = colisDistribution.map(c => `Coli ${c.colisNumber}: ${c.quantity}`).join(' | ');
        const excessColis = colisDistribution.filter(c => c.quantity > completeSets).map(c => `Coli ${c.colisNumber}: +${c.quantity - completeSets}`).join(', ');
        return { code: product.code, name: product.name, category: product.category, totalColis: product.total_colis, completeSets, totalUnits, incompleteUnits, colisDetail, excessColis, locations: lastCount.uniqueLocations.join(', ') || '-', damaged_stock: product.damaged_stock || 0 };
      })
      .filter(Boolean);
    
    if (incompleteProducts.length === 0) { return { count: 0 }; }
    
    const headers = ['Código', 'Nome', 'Categoria', 'Colis/Set', 'Sets Completos', 'Total Unidades', 'Unidades Incompletas', 'Distribuição por Coli', 'Colis em Excesso', 'Localizações', 'Avarias'];
    const rows = incompleteProducts.map(p => [p!.code, p!.name, p!.category, p!.totalColis.toString(), p!.completeSets.toString(), p!.totalUnits.toString(), p!.incompleteUnits.toString(), p!.colisDetail, p!.excessColis || '-', p!.locations, p!.damaged_stock.toString()]);
    
    const csvContent = [headers.join(';'), ...rows.map(row => row.map(cell => `"${cell}"`).join(';'))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `produtos_incompletos_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.csv`;
    link.click();
    return { count: incompleteProducts.length };
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
        <Select value={filterOrderStatus} onValueChange={(v) => setFilterOrderStatus(v as typeof filterOrderStatus)}>
          <SelectTrigger className={`w-full sm:w-48 transition-colors ${filterOrderStatus !== 'all' ? 'border-amber-500 bg-amber-50 text-amber-700' : ''}`}>
            <ShoppingBag className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Encomendas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="with_orders">
              <span className="flex items-center gap-2">
                <ClipboardList className="h-3 w-3 text-amber-600" />
                Com encomendas ({orderStats.withOrders})
              </span>
            </SelectItem>
            <SelectItem value="without_orders">
              <span className="flex items-center gap-2">
                <Package className="h-3 w-3 text-muted-foreground" />
                Sem encomendas ({orderStats.withoutOrders})
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="whitespace-nowrap">
              <Download className="h-4 w-4 mr-2" />
              Exportar
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 bg-background border shadow-lg z-50">
            {/* CSV Exports */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <FileText className="h-4 w-4 mr-2" />
                Exportar CSV
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="bg-background border shadow-lg z-50">
                <DropdownMenuItem onClick={() => exportProductsCSV(filteredProducts, 'produtos_completo')}>
                  <Package className="h-4 w-4 mr-2" />
                  Relatório Completo ({filteredProducts.length})
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  const result = exportIncompleteProducts();
                  if (result.count === 0) {
                    toast({ title: 'Tudo completo!', description: 'Não existem produtos com unidades incompletas' });
                  }
                }}>
                  <AlertTriangle className="h-4 w-4 mr-2 text-amber-600" />
                  Produtos Incompletos
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => exportProductsCSV(filteredProducts.filter(p => (p.damaged_stock || 0) > 0), 'produtos_com_avarias')}>
                  <AlertTriangle className="h-4 w-4 mr-2 text-red-600" />
                  Com Avarias ({productsWithDamagesCount})
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportProductsCSV(filteredProducts.filter(p => (p.damaged_stock || 0) === 0), 'produtos_sem_avarias')}>
                  <ShieldCheck className="h-4 w-4 mr-2 text-green-600" />
                  Sem Avarias ({productsWithoutDamagesCount})
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSeparator />

            {/* Excel Exports */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <FileSpreadsheet className="h-4 w-4 mr-2 text-green-600" />
                Exportar Excel
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="bg-background border shadow-lg z-50">
                <DropdownMenuItem onClick={() => exportProductsExcel(filteredProducts, 'produtos_completo', 'Produtos')}>
                  <Package className="h-4 w-4 mr-2" />
                  Relatório Completo ({filteredProducts.length})
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => exportProductsExcel(filteredProducts.filter(p => (p.damaged_stock || 0) > 0), 'produtos_com_avarias', 'Com Avarias')}>
                  <AlertTriangle className="h-4 w-4 mr-2 text-red-600" />
                  Com Avarias ({productsWithDamagesCount})
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportProductsExcel(filteredProducts.filter(p => (p.damaged_stock || 0) === 0), 'produtos_sem_avarias', 'Sem Avarias')}>
                  <ShieldCheck className="h-4 w-4 mr-2 text-green-600" />
                  Sem Avarias ({productsWithoutDamagesCount})
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
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
            {/* Virtualized Table */}
            <div className="overflow-x-auto">
              {/* Header */}
              <div className="flex items-center border-b bg-muted/50 sticky top-0 z-10">
                <div className="flex-shrink-0 p-2" style={{ width: '48px' }}>
                  <Checkbox
                    checked={selectedProducts.size === filteredProducts.length && filteredProducts.length > 0}
                    onCheckedChange={toggleAllSelection}
                    aria-label="Selecionar todos"
                  />
                </div>
                {isColumnVisible('code') && (
                  <div 
                    className="p-2 cursor-pointer hover:bg-muted/50 select-none font-medium text-muted-foreground text-sm"
                    style={{ width: `${DEFAULT_COLUMN_WIDTHS.code}px`, minWidth: `${DEFAULT_COLUMN_WIDTHS.code}px` }}
                    onClick={() => handleSort('code')}
                  >
                    <span className="flex items-center">
                      Código
                      {getSortIcon('code')}
                    </span>
                  </div>
                )}
                {isColumnVisible('name') && (
                  <div 
                    className="p-2 cursor-pointer hover:bg-muted/50 select-none font-medium text-muted-foreground text-sm"
                    style={{ width: `${DEFAULT_COLUMN_WIDTHS.name}px`, minWidth: `${DEFAULT_COLUMN_WIDTHS.name}px` }}
                    onClick={() => handleSort('name')}
                  >
                    <span className="flex items-center">
                      Nome
                      {getSortIcon('name')}
                    </span>
                  </div>
                )}
                {isColumnVisible('category') && (
                  <div 
                    className="p-2 cursor-pointer hover:bg-muted/50 select-none font-medium text-muted-foreground text-sm"
                    style={{ width: `${DEFAULT_COLUMN_WIDTHS.category}px`, minWidth: `${DEFAULT_COLUMN_WIDTHS.category}px` }}
                    onClick={() => handleSort('category')}
                  >
                    <span className="flex items-center">
                      Categoria
                      {getSortIcon('category')}
                    </span>
                  </div>
                )}
                {isColumnVisible('colis') && (
                  <div 
                    className="p-2 font-medium text-muted-foreground text-sm"
                    style={{ width: `${DEFAULT_COLUMN_WIDTHS.colis}px`, minWidth: `${DEFAULT_COLUMN_WIDTHS.colis}px` }}
                  >
                    Colis
                  </div>
                )}
                {isColumnVisible('stock') && (
                  <div 
                    className="p-2 cursor-pointer hover:bg-muted/50 select-none font-medium text-muted-foreground text-sm"
                    style={{ width: `${DEFAULT_COLUMN_WIDTHS.stock}px`, minWidth: `${DEFAULT_COLUMN_WIDTHS.stock}px` }}
                    onClick={() => handleSort('stock')}
                  >
                    <span className="flex items-center">
                      Sets
                      {getSortIcon('stock')}
                    </span>
                  </div>
                )}
                {isColumnVisible('damages') && (
                  <div 
                    className="p-2 font-medium text-muted-foreground text-sm"
                    style={{ width: `${DEFAULT_COLUMN_WIDTHS.damages}px`, minWidth: `${DEFAULT_COLUMN_WIDTHS.damages}px` }}
                  >
                    <span className="flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                      Avarias
                    </span>
                  </div>
                )}
                {isColumnVisible('totalUnits') && (
                  <div 
                    className="p-2 font-medium text-muted-foreground text-sm"
                    style={{ width: `${DEFAULT_COLUMN_WIDTHS.totalUnits}px`, minWidth: `${DEFAULT_COLUMN_WIDTHS.totalUnits}px` }}
                  >
                    Unidades
                  </div>
                )}
                {isColumnVisible('lastCount') && (
                  <div 
                    className="p-2 cursor-pointer hover:bg-muted/50 select-none font-medium text-muted-foreground text-sm"
                    style={{ width: `${DEFAULT_COLUMN_WIDTHS.lastCount}px`, minWidth: `${DEFAULT_COLUMN_WIDTHS.lastCount}px` }}
                    onClick={() => handleSort('lastCount')}
                  >
                    <span className="flex items-center">
                      Última Contagem
                      {getSortIcon('lastCount')}
                    </span>
                  </div>
                )}
                {isColumnVisible('colisLocations') && (
                  <div 
                    className="p-2 font-medium text-muted-foreground text-sm"
                    style={{ width: `${DEFAULT_COLUMN_WIDTHS.colisLocations}px`, minWidth: `${DEFAULT_COLUMN_WIDTHS.colisLocations}px` }}
                  >
                    Colis/Localização
                  </div>
                )}
                {isColumnVisible('location') && (
                  <div 
                    className="p-2 font-medium text-muted-foreground text-sm"
                    style={{ width: `${DEFAULT_COLUMN_WIDTHS.location}px`, minWidth: `${DEFAULT_COLUMN_WIDTHS.location}px` }}
                  >
                    Localização
                  </div>
                )}
                {isColumnVisible('pallet') && (
                  <div 
                    className="p-2 font-medium text-muted-foreground text-sm"
                    style={{ width: `${DEFAULT_COLUMN_WIDTHS.pallet}px`, minWidth: `${DEFAULT_COLUMN_WIDTHS.pallet}px` }}
                  >
                    Palete
                  </div>
                )}
                <div className="flex-shrink-0 p-2 font-medium text-muted-foreground text-sm text-right" style={{ width: '144px' }}>
                  Ações
                </div>
              </div>

              {/* Virtualized Body */}
              <div
                ref={parentRef}
                className="overflow-y-auto"
                style={{ height: 'calc(100vh - 400px)', minHeight: '400px', maxHeight: '700px' }}
              >
                <div
                  style={{
                    height: `${rowVirtualizer.getTotalSize()}px`,
                    width: '100%',
                    position: 'relative',
                  }}
                >
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const product = filteredProducts[virtualRow.index];
                    const lastCount = lastCounts[product.id];
                    return (
                      <div
                        key={product.id}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: `${virtualRow.size}px`,
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                      >
                        <VirtualizedProductRow
                          product={product}
                          lastCount={lastCount || null}
                          isSelected={selectedProducts.has(product.id)}
                          hasOrders={productIdsWithOrders.has(product.id)}
                          orderStats={getOrderStats(product.id)}
                          visibleColumns={visibleColumns}
                          columnWidths={DEFAULT_COLUMN_WIDTHS}
                          onToggleSelection={toggleProductSelection}
                          onEdit={setEditingProduct}
                          onViewDetails={setDetailsProduct}
                          onViewHistory={setHistoryProduct}
                          onViewMovements={setMovementHistoryProduct}
                          onDelete={deleteProduct}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
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

      {/* Product History Dialog (alterações de campos) */}
      {historyProduct && (
        <ProductHistoryDialog
          productId={historyProduct.id}
          productName={historyProduct.name}
          open={!!historyProduct}
          onOpenChange={(open) => !open && setHistoryProduct(null)}
        />
      )}

      {/* Product Movement History Dialog (movimentações de stock) */}
      {movementHistoryProduct && (
        <ProductMovementHistoryDialog
          productId={movementHistoryProduct.id}
          productName={movementHistoryProduct.name}
          productCode={movementHistoryProduct.code}
          open={!!movementHistoryProduct}
          onOpenChange={(open) => !open && setMovementHistoryProduct(null)}
        />
      )}

      {/* Product Colis Details Dialog */}
      {detailsProduct && (
        <ProductColisDetailsDialog
          product={detailsProduct}
          lastCount={lastCounts[detailsProduct.id] || null}
          open={!!detailsProduct}
          onOpenChange={(open) => !open && setDetailsProduct(null)}
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
