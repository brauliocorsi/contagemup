import { useState, useMemo, useEffect, useCallback } from 'react';
import { useProducts } from '@/hooks/useProducts';
import { useCounting } from '@/hooks/useCounting';
import { useSessions } from '@/hooks/useSessions';
import { useCategories } from '@/hooks/useCategories';
import { useDamages } from '@/hooks/useDamages';
import { CountingSummary } from './CountingSummary';
import { CountingFilters } from './CountingFilters';
import { CountingExportMenu } from './CountingExportMenu';
import { CountingProductList } from './CountingProductList';
import { CountingSessionSelector } from './CountingSessionSelector';
import { CountingHeader } from './CountingHeader';
import { useCountingFilters } from './hooks/useCountingFilters';
import { useCountingExport } from './hooks/useCountingExport';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { StockDistribution, ProductWithCounts } from '@/types/stock';

const STORAGE_KEY = 'counting_selected_session';

export function CountingView() {
  const { products, loading: productsLoading, updateProduct, fetchProducts } = useProducts();
  const { sessions, loading: sessionsLoading, createSession } = useSessions();
  const { categories, loading: categoriesLoading } = useCategories();
  const { reportDamage, getDamagesForProduct } = useDamages();
  
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEY);
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterLocation, setFilterLocation] = useState<string>('all');
  const [filterPallet, setFilterPallet] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');

  const { 
    incrementCount, 
    decrementCount, 
    updateLocation, 
    updatePalletNumber, 
    updateColisLocation, 
    updateColisPalletNumber, 
    getProductWithCounts, 
    deleteOrphanCounts, 
    splitColisStock,
    mergeColisStock,
    incrementCountAtLocation,
    decrementCountAtLocation,
  } = useCounting(selectedSessionId);

  const activeSessions = sessions.filter(s => s.status === 'active');

  // Auto-select session logic
  useEffect(() => {
    if (sessionsLoading || activeSessions.length === 0) return;
    
    if (selectedSessionId) {
      const sessionExists = activeSessions.some(s => s.id === selectedSessionId);
      if (sessionExists) return;
    }
    
    const preferredSession = activeSessions.find(s => 
      s.name.toLowerCase().includes('inventário 2026') || 
      s.name.toLowerCase().includes('inventario 2026')
    );
    
    if (preferredSession) {
      setSelectedSessionId(preferredSession.id);
      localStorage.setItem(STORAGE_KEY, preferredSession.id);
    }
  }, [sessionsLoading, activeSessions, selectedSessionId]);

  const handleSessionChange = (sessionId: string) => {
    setSelectedSessionId(sessionId);
    localStorage.setItem(STORAGE_KEY, sessionId);
    window.dispatchEvent(new CustomEvent('session-changed'));
  };

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

  // Get current session
  const currentSession = sessions.find(s => s.id === selectedSessionId);

  // Filter products based on session category first
  const sessionFilteredProducts = useMemo(() => {
    if (!currentSession || currentSession.category === 'Todas') {
      return productsWithCounts;
    }
    const sessionCategories = currentSession.category.split(',').map(c => c.trim());
    return productsWithCounts.filter(p => sessionCategories.includes(p.category));
  }, [productsWithCounts, currentSession]);

  // Use counting filters hook
  const {
    filteredProducts,
    incompleteProducts,
    completeProducts,
    categoriesWithCounts,
    locationsWithCounts,
    palletsWithCounts,
    statusCounts,
    productsWithoutLocation,
    productsWithoutPallet,
  } = useCountingFilters(sessionFilteredProducts as any, {
    searchTerm,
    filterStatus,
    filterLocation,
    filterPallet,
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
    filterPallet,
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

  const handleMergeStock = useCallback(async (productId: string, colisNumber: number, location: string, pallet: string): Promise<boolean> => {
    return await mergeColisStock(productId, colisNumber, location, pallet);
  }, [mergeColisStock]);

  const handleIncrementAtLocation = useCallback((productId: string, colisNumber: number, countId: string) => {
    incrementCountAtLocation(productId, colisNumber, countId);
  }, [incrementCountAtLocation]);

  const handleDecrementAtLocation = useCallback((productId: string, colisNumber: number, countId: string) => {
    decrementCountAtLocation(productId, colisNumber, countId);
  }, [decrementCountAtLocation]);

  const handleCreateSession = async (name: string, categoryValue: string) => {
    return await createSession(name, categoryValue);
  };

  const handleClearFilters = () => {
    setFilterStatus('all');
    setFilterLocation('all');
    setFilterPallet('all');
    setFilterCategory('all');
    setSearchTerm('');
  };

  const hasActiveFilters = filterStatus !== 'all' || filterLocation !== 'all' || filterPallet !== 'all' || filterCategory !== 'all' || searchTerm !== '';

  // Loading state
  if (productsLoading || sessionsLoading || categoriesLoading) {
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

  // No session selected
  if (!selectedSessionId) {
    return (
      <CountingSessionSelector
        activeSessions={activeSessions}
        availableCategories={availableCategories}
        onSessionChange={handleSessionChange}
        onCreateSession={handleCreateSession}
      />
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Session header */}
      <CountingHeader
        currentSession={currentSession}
        totalProducts={sessionFilteredProducts.length}
        onChangeSession={() => {
          setSelectedSessionId(null);
          localStorage.removeItem(STORAGE_KEY);
          window.dispatchEvent(new CustomEvent('session-changed'));
        }}
      />

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
        filterPallet={filterPallet}
        onFilterPalletChange={setFilterPallet}
        totalProducts={sessionFilteredProducts.length}
        statusCounts={statusCounts}
        categoriesWithCounts={categoriesWithCounts}
        locationsWithCounts={locationsWithCounts}
        palletsWithCounts={palletsWithCounts}
        productsWithoutLocation={productsWithoutLocation}
        productsWithoutPallet={productsWithoutPallet}
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
        onPalletChange={updatePalletNumber}
        onColisLocationChange={updateColisLocation}
        onColisPalletChange={updateColisPalletNumber}
        onAddColi={handleAddColi}
        onRemoveColi={handleRemoveColi}
        onCodeChange={handleCodeChange}
        onSplitStock={handleSplitStock}
        onMergeStock={handleMergeStock}
        onReportDamage={reportDamage}
      />
    </div>
  );
}
