import { useMemo } from 'react';

export interface ProductWithCounts {
  id: string;
  code: string;
  name: string;
  category: string;
  location?: string | null;
  pallet_number?: string | null;
  total_colis: number;
  completeSets: number;
  hasPartialProduct: boolean;
  status: string;
  uniqueLocations: string[];
  uniquePallets: string[];
  colisDetails: Array<{
    colis_number: number;
    quantity: number;
    location?: string | null;
    pallet_number?: string | null;
  }>;
}

export interface FilterState {
  searchTerm: string;
  filterStatus: string;
  filterLocation: string;
  filterPallet: string;
  filterCategory: string;
}

export function useCountingFilters(
  sessionFilteredProducts: ProductWithCounts[],
  filters: FilterState
) {
  const { searchTerm, filterStatus, filterLocation, filterPallet, filterCategory } = filters;

  // Extract unique categories from session filtered products with counts
  const categoriesWithCounts = useMemo(() => {
    const countMap: Record<string, number> = {};
    sessionFilteredProducts.forEach(p => {
      if (p.category) {
        countMap[p.category] = (countMap[p.category] || 0) + 1;
      }
    });
    return Object.entries(countMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [sessionFilteredProducts]);

  // Extract unique locations with counts
  const locationsWithCounts = useMemo(() => {
    const countMap: Record<string, number> = {};
    sessionFilteredProducts.forEach(p => {
      p.uniqueLocations.forEach(loc => {
        if (loc) {
          countMap[loc] = (countMap[loc] || 0) + 1;
        }
      });
      if (p.uniqueLocations.length === 0 && p.location?.trim()) {
        countMap[p.location.trim()] = (countMap[p.location.trim()] || 0) + 1;
      }
    });
    return Object.entries(countMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [sessionFilteredProducts]);

  // Count products without location
  const productsWithoutLocation = useMemo(() => {
    return sessionFilteredProducts.filter(p => !p.location?.trim()).length;
  }, [sessionFilteredProducts]);

  // Count products without pallet
  const productsWithoutPallet = useMemo(() => {
    return sessionFilteredProducts.filter(p => 
      p.uniquePallets.length === 0 && !p.pallet_number?.trim()
    ).length;
  }, [sessionFilteredProducts]);

  // Extract unique pallets with counts
  const palletsWithCounts = useMemo(() => {
    const countMap: Record<string, number> = {};
    sessionFilteredProducts.forEach(p => {
      p.uniquePallets.forEach(pallet => {
        if (pallet) {
          countMap[pallet] = (countMap[pallet] || 0) + 1;
        }
      });
      if (p.uniquePallets.length === 0 && p.pallet_number?.trim()) {
        countMap[p.pallet_number.trim()] = (countMap[p.pallet_number.trim()] || 0) + 1;
      }
    });
    return Object.entries(countMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [sessionFilteredProducts]);

  // Status counts
  const statusCounts = useMemo(() => {
    const incomplete = sessionFilteredProducts.filter(p => p.hasPartialProduct).length;
    const complete = sessionFilteredProducts.filter(p => p.completeSets > 0).length;
    const excess = sessionFilteredProducts.filter(p => p.status === 'excess').length;
    const notCounted = sessionFilteredProducts.filter(p => p.status === 'not_counted').length;
    return { incomplete, complete, excess, notCounted };
  }, [sessionFilteredProducts]);

  // Filtered products
  const filteredProducts = useMemo(() => {
    return sessionFilteredProducts.filter(product => {
      const matchesSearch = 
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (product.location && product.location.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (product.pallet_number && product.pallet_number.toLowerCase().includes(searchTerm.toLowerCase()));

      const isCompleteEnough = product.completeSets > 0;
      const isPending = product.hasPartialProduct;

      const matchesFilter =
        filterStatus === 'all' ||
        (filterStatus === 'complete' && isCompleteEnough) ||
        (filterStatus === 'incomplete' && isPending) ||
        (filterStatus !== 'complete' && filterStatus !== 'incomplete' && product.status === filterStatus);

      const productLocations = product.uniqueLocations.length > 0 
        ? product.uniqueLocations 
        : (product.location?.trim() ? [product.location.trim()] : []);
      const matchesLocation = filterLocation === 'all' || 
        (filterLocation === '__empty__' && productLocations.length === 0) ||
        productLocations.includes(filterLocation);
      
      const productPallets = product.uniquePallets.length > 0 
        ? product.uniquePallets 
        : (product.pallet_number?.trim() ? [product.pallet_number.trim()] : []);
      const matchesPallet = filterPallet === 'all' || 
        (filterPallet === '__empty__' && productPallets.length === 0) ||
        productPallets.includes(filterPallet);
      
      const matchesCategory = filterCategory === 'all' || product.category === filterCategory;

      return matchesSearch && matchesFilter && matchesLocation && matchesPallet && matchesCategory;
    });
  }, [sessionFilteredProducts, searchTerm, filterStatus, filterLocation, filterPallet, filterCategory]);

  // Grouped products
  const incompleteProducts = filteredProducts.filter(p => p.hasPartialProduct);
  const completeProducts = filteredProducts.filter(p => p.completeSets > 0);
  const otherProducts = filteredProducts.filter(p => !p.hasPartialProduct && p.completeSets === 0);

  return {
    filteredProducts,
    incompleteProducts,
    completeProducts,
    otherProducts,
    categoriesWithCounts,
    locationsWithCounts,
    palletsWithCounts,
    statusCounts,
    productsWithoutLocation,
    productsWithoutPallet,
  };
}
