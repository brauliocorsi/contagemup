import { useState, useMemo, useEffect, useCallback } from 'react';
import { useProducts } from '@/hooks/useProducts';
import { useCounting } from '@/hooks/useCounting';
import { useCategories } from '@/hooks/useCategories';
import { useDamages } from '@/hooks/useDamages';
import { CountingSummary } from './CountingSummary';
import { CountingFilters } from './CountingFilters';
import { CountingExportMenu } from './CountingExportMenu';
import { CountingProductList } from './CountingProductList';
import { CountingAccessGate, CountingUnlock } from './CountingAccessGate';
import { useCountingFilters } from './hooks/useCountingFilters';
import { useCountingExport } from './hooks/useCountingExport';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { StockDistribution, ProductWithCounts } from '@/types/stock';
import { PageContainer } from '@/components/layout/PageContainer';

export function CountingView() {
  const { products, loading: productsLoading, updateProduct, fetchProducts } = useProducts();
  const { categories, loading: categoriesLoading } = useCategories();
  const { reportDamage, getDamagesForProduct } = useDamages();
  
  // A sessão de contagem deixou de existir na navegação: as linhas vivas de counts têm session_id a NULL.
  const selectedSessionId: string | null = null;
  const [unlock, setUnlock] = useState<CountingUnlock | null>(null);
  const readOnly = !unlock;
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterLocation, setFilterLocation] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');

  const { 
    incrementCount, 
    decrementCount, 
    updateLocation, 
    updateColisLocation, 
    getProductWithCounts, 
    deleteOrphanCounts, 
    splitColisStock,
    mergeColisStock,
    incrementCountAtLocation,
    decrementCountAtLocation,
  } = useCounting(selectedSessionId);

  // Category helpers
  const availableCategories = useMemo(() => {
    return categories.map(c => c.name).sort();
  }, [categories]);

  const categoryColisNamesMap = useMemo(() => {
    const map: Record<string, Record<string, string> | null> = {};
    categories.forEach(cat => {
      map[cat.name] = cat.colis_names;
    });
    return map;
  }, [categories]);

  const categoriesRequiringOrder = useMemo(() => {
    const map: Record<string, boolean> = {};
    categories.forEach(cat => {
      map[cat.name] = cat.requires_order_number || false;
    });
    return map;
  }, [categories]);

  // Build products with counts
  const productsWithCounts = useMemo(() => {
    return products.map(p => {
      const categoryColisNames = categoryColisNamesMap[p.category] || null;
      return getProductWithCounts(p, categoryColisNames);
    });
  }, [products, getProductWithCounts, categoryColisNamesMap]);

  // Quando a contagem está desbloqueada por uma conferência, só se pode contar
  // nas localizações dessa conferência. Fora delas, nada.
  const sessionFilteredProducts = useMemo(() => {
    if (!unlock) return productsWithCounts;
    const allowed = new Set(unlock.locations.map(l => l.trim().toUpperCase()));
    return productsWithCounts.filter((p: ProductWithCounts) =>
      p.uniqueLocations.some(l => allowed.has((l || '').trim().toUpperCase())));
  }, [productsWithCounts, unlock]);

  // Use counting filters hook
  const {
    filteredProducts,
    incompleteProducts,
    completeProducts,
    categoriesWithCounts,
    locationsWithCounts,
    statusCounts,
    productsWithoutLocation,
  } = useCountingFilters(sessionFilteredProducts as any, {
    searchTerm,
    filterStatus,
    filterLocation,
    filterCategory,
  });

  // Build set of product IDs with active damages
  const productIdsWithDamages = useMemo(() => {
    const set = new Set<string>();
    filteredProducts.forEach((p: any) => {
      const damages = getDamagesForProduct(p.id);
      if (damages && damages.length > 0) {
        set.add(p.id);
      }
    });
    return set;
  }, [filteredProducts, getDamagesForProduct]);

  // Use counting export hook
  const {
    exportFilteredReport,
    exportIncompleteReport,
    exportCompleteReport,
    exportFilteredReportExcel,
    exportIncompleteReportExcel,
    exportCompleteReportExcel,
    exportWithDamagesCSV,
    exportWithoutDamagesCSV,
    exportWithDamagesExcel,
    exportWithoutDamagesExcel,
  } = useCountingExport(filteredProducts as any, {
    filterStatus,
    filterCategory,
    filterLocation,
    searchTerm,
  }, productIdsWithDamages);

  // Product action handlers
  const handleAddColi = async (productId: string, newTotalColis: number) => {
    await updateProduct(productId, { total_colis: newTotalColis });
    await fetchProducts();
    toast.success("Coli adicionado ao produto");
  };

  const handleRemoveColi = async (productId: string, newTotalColis: number) => {
    await deleteOrphanCounts(productId, newTotalColis);
    await updateProduct(productId, { total_colis: newTotalColis });
    await fetchProducts();
    toast.success("Coli removido do produto");
  };

  const handleCodeChange = async (productId: string, newCode: string): Promise<boolean> => {
    if (!newCode.trim()) {
      toast.error("O código não pode estar vazio");
      return false;
    }
    const success = await updateProduct(productId, { code: newCode });
    if (success) {
      await fetchProducts();
      toast.success("Código do produto atualizado");
    }
    return success;
  };

  const handleSplitStock = useCallback(async (productId: string, colisNumber: number, distributions: StockDistribution[]): Promise<boolean> => {
    return await splitColisStock(productId, colisNumber, distributions);
  }, [splitColisStock]);

  const handleMergeStock = useCallback(async (productId: string, colisNumber: number, location: string): Promise<boolean> => {
    return await mergeColisStock(productId, colisNumber, location);
  }, [mergeColisStock]);

  const handleIncrementAtLocation = useCallback((productId: string, colisNumber: number, countId: string) => {
    incrementCountAtLocation(productId, colisNumber, countId);
  }, [incrementCountAtLocation]);

  const handleDecrementAtLocation = useCallback((productId: string, colisNumber: number, countId: string) => {
    decrementCountAtLocation(productId, colisNumber, countId);
  }, [decrementCountAtLocation]);

  const handleClearFilters = () => {
    setFilterStatus('all');
    setFilterLocation('all');
    setFilterCategory('all');
    setSearchTerm('');
  };

  const hasActiveFilters = filterStatus !== 'all' || filterLocation !== 'all' || filterCategory !== 'all' || searchTerm !== '';

  // Loading state
  if (productsLoading || categoriesLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-20 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <PageContainer className="p-4">

      {/* Acesso à contagem */}
      <CountingAccessGate unlock={unlock} onUnlock={setUnlock} />

      {/* Summary */}
      <CountingSummary products={sessionFilteredProducts as ProductWithCounts[]} />

      {/* Search and filters */}
      <CountingFilters
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        filterStatus={filterStatus}
        onFilterStatusChange={setFilterStatus}
        filterCategory={filterCategory}
        onFilterCategoryChange={setFilterCategory}
        filterLocation={filterLocation}
        onFilterLocationChange={setFilterLocation}
        totalProducts={sessionFilteredProducts.length}
        statusCounts={statusCounts}
        categoriesWithCounts={categoriesWithCounts}
        locationsWithCounts={locationsWithCounts}
        productsWithoutLocation={productsWithoutLocation}
        onClearFilters={handleClearFilters}
        hasActiveFilters={hasActiveFilters}
      >
        <CountingExportMenu
          totalFiltered={filteredProducts.length}
          totalComplete={completeProducts.filter(p => !p.hasPartialProduct).length}
          totalWithDamages={productIdsWithDamages.size}
          totalWithoutDamages={filteredProducts.length - productIdsWithDamages.size}
          onExportFilteredCSV={exportFilteredReport}
          onExportCompleteCSV={exportCompleteReport}
          onExportIncompleteCSV={exportIncompleteReport}
          onExportFilteredExcel={exportFilteredReportExcel}
          onExportCompleteExcel={exportCompleteReportExcel}
          onExportIncompleteExcel={exportIncompleteReportExcel}
          onExportWithDamagesCSV={exportWithDamagesCSV}
          onExportWithoutDamagesCSV={exportWithoutDamagesCSV}
          onExportWithDamagesExcel={exportWithDamagesExcel}
          onExportWithoutDamagesExcel={exportWithoutDamagesExcel}
        />
      </CountingFilters>

      {/* Products organized by status */}
      <CountingProductList
        filteredProducts={filteredProducts as ProductWithCounts[]}
        incompleteProducts={incompleteProducts as ProductWithCounts[]}
        completeProducts={completeProducts as ProductWithCounts[]}
        sessionId={selectedSessionId || undefined}
        categoryColisNamesMap={categoryColisNamesMap}
        categoriesRequiringOrder={categoriesRequiringOrder}
        getDamagesForProduct={getDamagesForProduct}
        onIncrement={incrementCount}
        onDecrement={decrementCount}
        onIncrementAtLocation={handleIncrementAtLocation}
        onDecrementAtLocation={handleDecrementAtLocation}
        onLocationChange={updateLocation}
        onColisLocationChange={updateColisLocation}
        onAddColi={handleAddColi}
        onRemoveColi={handleRemoveColi}
        onCodeChange={handleCodeChange}
        onSplitStock={handleSplitStock}
        onMergeStock={handleMergeStock}
        onReportDamage={reportDamage}
        readOnly={readOnly}
      />
    </PageContainer>
  );
}
