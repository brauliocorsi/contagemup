import { useState, useMemo, useEffect, useCallback } from 'react';
import { useProducts } from '@/hooks/useProducts';
import { useCounting } from '@/hooks/useCounting';
import { useSessions } from '@/hooks/useSessions';
import { useCategories } from '@/hooks/useCategories';
import { useDamages } from '@/hooks/useDamages';
import { ProductCard } from './ProductCard';
import { CountingSummary } from './CountingSummary';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Plus, Filter, Package, AlertCircle, CheckCircle2, Tags, MapPin, Box, X, Download, FileSpreadsheet, FileText } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from '@/components/ui/dropdown-menu';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { StockDistribution } from '@/types/stock';
import * as XLSX from 'xlsx';

const STORAGE_KEY = 'counting_selected_session';
const PREFERRED_SESSION_NAME = 'Inventário 2026';

export function CountingView() {
  const { products, loading: productsLoading, updateProduct, fetchProducts } = useProducts();
  const { sessions, loading: sessionsLoading, createSession } = useSessions();
  const { categories, loading: categoriesLoading } = useCategories();
  const { reportDamage, getDamagesForProduct } = useDamages();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(() => {
    // Try to restore from localStorage
    return localStorage.getItem(STORAGE_KEY);
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterLocation, setFilterLocation] = useState<string>('all');
  const [filterPallet, setFilterPallet] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [newSessionName, setNewSessionName] = useState('');
  const [newSessionCategories, setNewSessionCategories] = useState<string[]>([]);
  const [allCategoriesSelected, setAllCategoriesSelected] = useState(true);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

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
    loading: countingLoading 
  } = useCounting(selectedSessionId);

  const activeSessions = sessions.filter(s => s.status === 'active');

  // Auto-select session logic: prioritize saved session, then "Inventário 2026", then first active
  useEffect(() => {
    if (sessionsLoading || activeSessions.length === 0) return;
    
    // If we already have a valid selected session, keep it
    if (selectedSessionId) {
      const sessionExists = activeSessions.some(s => s.id === selectedSessionId);
      if (sessionExists) return;
    }
    
    // Try to find "Inventário 2026" session first
    const preferredSession = activeSessions.find(s => 
      s.name.toLowerCase().includes('inventário 2026') || 
      s.name.toLowerCase().includes('inventario 2026')
    );
    
    if (preferredSession) {
      setSelectedSessionId(preferredSession.id);
      localStorage.setItem(STORAGE_KEY, preferredSession.id);
    }
  }, [sessionsLoading, activeSessions, selectedSessionId]);

  // Persist session selection to localStorage and notify header
  const handleSessionChange = (sessionId: string) => {
    setSelectedSessionId(sessionId);
    localStorage.setItem(STORAGE_KEY, sessionId);
    // Dispatch custom event for same-tab header update
    window.dispatchEvent(new CustomEvent('session-changed'));
  };

  // Use categories from database
  const availableCategories = useMemo(() => {
    return categories.map(c => c.name).sort();
  }, [categories]);

  // Create a map of category name to colis_names for quick lookup
  const categoryColisNamesMap = useMemo(() => {
    const map: Record<string, Record<string, string> | null> = {};
    categories.forEach(cat => {
      map[cat.name] = cat.colis_names;
    });
    return map;
  }, [categories]);

  // Create a map of category name to requires_order_number for quick lookup
  const categoriesRequiringOrder = useMemo(() => {
    const map: Record<string, boolean> = {};
    categories.forEach(cat => {
      map[cat.name] = cat.requires_order_number || false;
    });
    return map;
  }, [categories]);

  const handleToggleCategory = (categoryName: string) => {
    setNewSessionCategories(prev => 
      prev.includes(categoryName) 
        ? prev.filter(c => c !== categoryName)
        : [...prev, categoryName]
    );
  };

  const handleToggleAllCategories = (checked: boolean) => {
    setAllCategoriesSelected(checked);
    if (checked) {
      setNewSessionCategories([]);
    }
  };

  const handleCreateSession = async () => {
    if (!newSessionName.trim()) return;
    setIsCreatingSession(true);
    
    // Build category string: "Todas" for all, or comma-separated for specific
    const categoryValue = allCategoriesSelected 
      ? 'Todas' 
      : newSessionCategories.join(',');
    
    const session = await createSession(newSessionName, categoryValue);
    if (session) {
      handleSessionChange(session.id);
      setNewSessionName('');
      setNewSessionCategories([]);
      setAllCategoriesSelected(true);
      setDialogOpen(false);
    }
    setIsCreatingSession(false);
  };

  const handleAddColi = async (productId: string, newTotalColis: number) => {
    await updateProduct(productId, { total_colis: newTotalColis });
    await fetchProducts();
    toast.success("Coli adicionado ao produto");
  };

  const handleRemoveColi = async (productId: string, newTotalColis: number) => {
    // 1. Limpar contagens órfãs primeiro
    await deleteOrphanCounts(productId, newTotalColis);
    
    // 2. Atualizar produto
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

  const productsWithCounts = useMemo(() => {
    return products.map(p => {
      const categoryColisNames = categoryColisNamesMap[p.category] || null;
      return getProductWithCounts(p, categoryColisNames);
    });
  }, [products, getProductWithCounts, categoryColisNamesMap]);

  // Get current session
  const currentSession = sessions.find(s => s.id === selectedSessionId);

  // Filter products based on session category/categories first
  const sessionFilteredProducts = useMemo(() => {
    if (!currentSession || currentSession.category === 'Todas') {
      return productsWithCounts;
    }
    // Support multiple categories separated by comma
    const sessionCategories = currentSession.category.split(',').map(c => c.trim());
    return productsWithCounts.filter(p => sessionCategories.includes(p.category));
  }, [productsWithCounts, currentSession]);

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

  // Extract unique locations with counts - now considering all coli locations
  const locationsWithCounts = useMemo(() => {
    const countMap: Record<string, number> = {};
    sessionFilteredProducts.forEach(p => {
      // Include all unique locations from colis
      p.uniqueLocations.forEach(loc => {
        if (loc) {
          countMap[loc] = (countMap[loc] || 0) + 1;
        }
      });
      // Also check product default location if no coli locations
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

  // Count products without pallet - check uniquePallets array and product default
  const productsWithoutPallet = useMemo(() => {
    return sessionFilteredProducts.filter(p => 
      p.uniquePallets.length === 0 && !p.pallet_number?.trim()
    ).length;
  }, [sessionFilteredProducts]);

  // Extract unique pallets with counts - from all coli pallets
  const palletsWithCounts = useMemo(() => {
    const countMap: Record<string, number> = {};
    sessionFilteredProducts.forEach(p => {
      // Include all unique pallets from colis
      p.uniquePallets.forEach(pallet => {
        if (pallet) {
          countMap[pallet] = (countMap[pallet] || 0) + 1;
        }
      });
      // Also check product default pallet if no coli pallets
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

      // Fixed location filter - check all coli locations
      const productLocations = product.uniqueLocations.length > 0 
        ? product.uniqueLocations 
        : (product.location?.trim() ? [product.location.trim()] : []);
      const matchesLocation = filterLocation === 'all' || 
        (filterLocation === '__empty__' && productLocations.length === 0) ||
        productLocations.includes(filterLocation);
      
      // Pallet filter - check uniquePallets array (coli pallets) and product default
      const productPallets = product.uniquePallets.length > 0 
        ? product.uniquePallets 
        : (product.pallet_number?.trim() ? [product.pallet_number.trim()] : []);
      const matchesPallet = filterPallet === 'all' || 
        (filterPallet === '__empty__' && productPallets.length === 0) ||
        productPallets.includes(filterPallet);
      
      // Category filter
      const matchesCategory = filterCategory === 'all' || product.category === filterCategory;

      return matchesSearch && matchesFilter && matchesLocation && matchesPallet && matchesCategory;
    });
  }, [sessionFilteredProducts, searchTerm, filterStatus, filterLocation, filterPallet, filterCategory]);

  const incompleteProducts = filteredProducts.filter(p => p.hasPartialProduct);
  const completeProducts = filteredProducts.filter(p => p.completeSets > 0);
  const otherProducts = filteredProducts.filter(p => !p.hasPartialProduct && p.completeSets === 0);

  // Helper function to calculate missing colis for a product
  const getMissingColisInfo = useCallback((product: typeof productsWithCounts[0]) => {
    if (product.total_colis <= 1) return '-';
    
    // Get quantity per coli
    const colisQuantities: Record<number, number> = {};
    for (let i = 1; i <= product.total_colis; i++) {
      colisQuantities[i] = 0;
    }
    
    product.colisDetails.forEach(detail => {
      colisQuantities[detail.colis_number] = (colisQuantities[detail.colis_number] || 0) + detail.quantity;
    });
    
    // Find the minimum to know how many complete sets
    const quantities = Object.values(colisQuantities);
    const minQty = Math.min(...quantities);
    
    // Find colis with quantities below max (indicating missing parts)
    const maxQty = Math.max(...quantities);
    if (minQty === maxQty) return '-'; // All equal, no missing
    
    const missingColis = Object.entries(colisQuantities)
      .filter(([_, qty]) => qty < maxQty)
      .map(([coliNum, qty]) => `Coli ${coliNum}: falta ${maxQty - qty}`)
      .join(', ');
    
    return missingColis || '-';
  }, []);

  // Helper function to get colis distribution string
  const getColisDistribution = useCallback((product: typeof productsWithCounts[0]) => {
    if (product.total_colis <= 1) {
      const totalQty = product.colisDetails.reduce((sum, d) => sum + d.quantity, 0);
      return totalQty > 0 ? `${totalQty} un.` : '0 un.';
    }
    
    const colisQuantities: Record<number, number> = {};
    for (let i = 1; i <= product.total_colis; i++) {
      colisQuantities[i] = 0;
    }
    
    product.colisDetails.forEach(detail => {
      colisQuantities[detail.colis_number] = (colisQuantities[detail.colis_number] || 0) + detail.quantity;
    });
    
    return Object.entries(colisQuantities)
      .map(([coliNum, qty]) => `C${coliNum}:${qty}`)
      .join(' | ');
  }, []);

  // Export function for filtered products report
  const exportFilteredReport = useCallback(() => {
    if (filteredProducts.length === 0) {
      toast.error('Nenhum produto para exportar');
      return;
    }

    const headers = [
      'Código',
      'Nome',
      'Categoria',
      'Localização',
      'Palete',
      'Colis/Set',
      'Sets Completos',
      'Distribuição Colis',
      'Status',
      'Colis Faltantes'
    ];

    const rows = filteredProducts.map(product => {
      const status = product.completeSets > 0
        ? (product.hasPartialProduct ? 'Completo + Pendente' : 'Completo')
        : (product.status === 'not_counted' ? 'Não Contado' : 'Incompleto');
      
      const locations = product.uniqueLocations.length > 0 
        ? product.uniqueLocations.join(', ') 
        : (product.location || '-');
      
      const pallets = product.uniquePallets.length > 0 
        ? product.uniquePallets.join(', ') 
        : (product.pallet_number || '-');

      return [
        product.code,
        product.name,
        product.category,
        locations,
        pallets,
        product.total_colis.toString(),
        product.completeSets.toString(),
        getColisDistribution(product),
        status,
        getMissingColisInfo(product)
      ];
    });

    // Add summary
    const totalComplete = filteredProducts.filter(p => p.completeSets > 0 && !p.hasPartialProduct).length;
    const totalIncomplete = filteredProducts.filter(p => p.hasPartialProduct || (p.completeSets === 0 && p.status !== 'not_counted')).length;
    const totalNotCounted = filteredProducts.filter(p => p.status === 'not_counted').length;
    const totalSets = filteredProducts.reduce((sum, p) => sum + p.completeSets, 0);

    const summaryRows = [
      [],
      ['RESUMO'],
      ['Total Produtos', filteredProducts.length.toString()],
      ['Produtos Completos', totalComplete.toString()],
      ['Produtos Incompletos', totalIncomplete.toString()],
      ['Não Contados', totalNotCounted.toString()],
      ['Total Sets Completos', totalSets.toString()],
      [],
      ['Filtros Aplicados'],
      ['Status', filterStatus !== 'all' ? filterStatus : 'Todos'],
      ['Categoria', filterCategory !== 'all' ? filterCategory : 'Todas'],
      ['Localização', filterLocation !== 'all' ? (filterLocation === '__empty__' ? 'Sem localização' : filterLocation) : 'Todas'],
      ['Palete', filterPallet !== 'all' ? (filterPallet === '__empty__' ? 'Sem palete' : filterPallet) : 'Todos'],
      ['Pesquisa', searchTerm || '-']
    ];

    const csvContent = [
      headers.join(';'),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(';')),
      ...summaryRows.map(row => row.map(cell => `"${cell || ''}"`).join(';'))
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `relatorio_contagem_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);

    toast.success(`${filteredProducts.length} produtos exportados`);
  }, [filteredProducts, filterStatus, filterCategory, filterLocation, filterPallet, searchTerm, getColisDistribution, getMissingColisInfo]);

  // Export only incomplete products
  const exportIncompleteReport = useCallback(() => {
    const incomplete = filteredProducts.filter(p => p.hasPartialProduct || (p.total_colis > 1 && p.colisDetails.length > 0));
    
    if (incomplete.length === 0) {
      toast.info('Nenhum produto incompleto para exportar');
      return;
    }

    const headers = [
      'Código',
      'Nome',
      'Categoria',
      'Localização',
      'Palete',
      'Colis/Set',
      'Sets Completos',
      'Distribuição Colis',
      'Colis Faltantes',
      'Detalhes'
    ];

    const rows = incomplete
      .filter(product => {
        // Only include if it really has missing colis
        if (product.total_colis <= 1) return false;
        const missingInfo = getMissingColisInfo(product);
        return missingInfo !== '-' || product.hasPartialProduct;
      })
      .map(product => {
        const locations = product.uniqueLocations.length > 0 
          ? product.uniqueLocations.join(', ') 
          : (product.location || '-');
        
        const pallets = product.uniquePallets.length > 0 
          ? product.uniquePallets.join(', ') 
          : (product.pallet_number || '-');

        const missingInfo = getMissingColisInfo(product);
        const details = product.hasPartialProduct 
          ? 'Tem pendências' 
          : (missingInfo !== '-' ? 'Colis em falta' : '-');

        return [
          product.code,
          product.name,
          product.category,
          locations,
          pallets,
          product.total_colis.toString(),
          product.completeSets.toString(),
          getColisDistribution(product),
          missingInfo,
          details
        ];
      });

    if (rows.length === 0) {
      toast.info('Todos os produtos estão completos!');
      return;
    }

    const csvContent = [
      headers.join(';'),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(';'))
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `produtos_incompletos_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);

    toast.success(`${rows.length} produtos incompletos exportados`);
  }, [filteredProducts, getColisDistribution, getMissingColisInfo]);

  // Export only complete products
  const exportCompleteReport = useCallback(() => {
    const complete = filteredProducts.filter(p => p.completeSets > 0 && !p.hasPartialProduct);
    
    if (complete.length === 0) {
      toast.info('Nenhum produto 100% completo para exportar');
      return;
    }

    const headers = [
      'Código',
      'Nome',
      'Categoria',
      'Localização',
      'Palete',
      'Colis/Set',
      'Sets Completos',
      'Distribuição Colis'
    ];

    const rows = complete.map(product => {
      const locations = product.uniqueLocations.length > 0 
        ? product.uniqueLocations.join(', ') 
        : (product.location || '-');
      
      const pallets = product.uniquePallets.length > 0 
        ? product.uniquePallets.join(', ') 
        : (product.pallet_number || '-');

      return [
        product.code,
        product.name,
        product.category,
        locations,
        pallets,
        product.total_colis.toString(),
        product.completeSets.toString(),
        getColisDistribution(product)
      ];
    });

    // Add totals
    const totalSets = complete.reduce((sum, p) => sum + p.completeSets, 0);

    const csvContent = [
      headers.join(';'),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(';')),
      '',
      `"TOTAL";"";"";"";"";"${complete.length} produtos";"${totalSets} sets";""`
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `produtos_completos_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);

    toast.success(`${complete.length} produtos completos exportados`);
  }, [filteredProducts, getColisDistribution]);

  // Helper function to export to Excel
  const exportToExcel = useCallback((data: (string | number)[][], filename: string, sheetName: string = 'Relatório') => {
    const worksheet = XLSX.utils.aoa_to_sheet(data);
    
    // Auto-size columns
    const colWidths = data[0].map((_, colIndex) => {
      const maxLength = Math.max(...data.map(row => String(row[colIndex] || '').length));
      return { wch: Math.min(Math.max(maxLength + 2, 10), 50) };
    });
    worksheet['!cols'] = colWidths;
    
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, filename);
  }, []);

  // Export filtered report to Excel
  const exportFilteredReportExcel = useCallback(() => {
    if (filteredProducts.length === 0) {
      toast.error('Nenhum produto para exportar');
      return;
    }

    const headers = [
      'Código', 'Nome', 'Categoria', 'Localização', 'Palete',
      'Colis/Set', 'Sets Completos', 'Distribuição Colis', 'Status', 'Colis Faltantes'
    ];

    const rows = filteredProducts.map(product => {
      const status = product.completeSets > 0
        ? (product.hasPartialProduct ? 'Completo + Pendente' : 'Completo')
        : (product.status === 'not_counted' ? 'Não Contado' : 'Incompleto');
      
      const locations = product.uniqueLocations.length > 0 
        ? product.uniqueLocations.join(', ') 
        : (product.location || '-');
      
      const pallets = product.uniquePallets.length > 0 
        ? product.uniquePallets.join(', ') 
        : (product.pallet_number || '-');

      return [
        product.code, product.name, product.category, locations, pallets,
        product.total_colis, product.completeSets, getColisDistribution(product),
        status, getMissingColisInfo(product)
      ];
    });

    const totalComplete = filteredProducts.filter(p => p.completeSets > 0 && !p.hasPartialProduct).length;
    const totalIncomplete = filteredProducts.filter(p => p.hasPartialProduct || (p.completeSets === 0 && p.status !== 'not_counted')).length;
    const totalNotCounted = filteredProducts.filter(p => p.status === 'not_counted').length;
    const totalSets = filteredProducts.reduce((sum, p) => sum + p.completeSets, 0);

    const summaryRows: (string | number)[][] = [
      [],
      ['RESUMO'],
      ['Total Produtos', filteredProducts.length],
      ['Produtos Completos', totalComplete],
      ['Produtos Incompletos', totalIncomplete],
      ['Não Contados', totalNotCounted],
      ['Total Sets Completos', totalSets],
      [],
      ['Filtros Aplicados'],
      ['Status', filterStatus !== 'all' ? filterStatus : 'Todos'],
      ['Categoria', filterCategory !== 'all' ? filterCategory : 'Todas'],
      ['Localização', filterLocation !== 'all' ? (filterLocation === '__empty__' ? 'Sem localização' : filterLocation) : 'Todas'],
      ['Palete', filterPallet !== 'all' ? (filterPallet === '__empty__' ? 'Sem palete' : filterPallet) : 'Todos'],
      ['Pesquisa', searchTerm || '-']
    ];

    const allData = [headers, ...rows, ...summaryRows];
    exportToExcel(allData, `relatorio_contagem_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.xlsx`, 'Contagem');
    toast.success(`${filteredProducts.length} produtos exportados para Excel`);
  }, [filteredProducts, filterStatus, filterCategory, filterLocation, filterPallet, searchTerm, getColisDistribution, getMissingColisInfo, exportToExcel]);

  // Export incomplete products to Excel
  const exportIncompleteReportExcel = useCallback(() => {
    const incomplete = filteredProducts.filter(p => p.hasPartialProduct || (p.total_colis > 1 && p.colisDetails.length > 0));
    
    const rows = incomplete
      .filter(product => {
        if (product.total_colis <= 1) return false;
        const missingInfo = getMissingColisInfo(product);
        return missingInfo !== '-' || product.hasPartialProduct;
      })
      .map(product => {
        const locations = product.uniqueLocations.length > 0 
          ? product.uniqueLocations.join(', ') 
          : (product.location || '-');
        
        const pallets = product.uniquePallets.length > 0 
          ? product.uniquePallets.join(', ') 
          : (product.pallet_number || '-');

        const missingInfo = getMissingColisInfo(product);
        const details = product.hasPartialProduct 
          ? 'Tem pendências' 
          : (missingInfo !== '-' ? 'Colis em falta' : '-');

        return [
          product.code, product.name, product.category, locations, pallets,
          product.total_colis, product.completeSets, getColisDistribution(product),
          missingInfo, details
        ];
      });

    if (rows.length === 0) {
      toast.info('Todos os produtos estão completos!');
      return;
    }

    const headers = [
      'Código', 'Nome', 'Categoria', 'Localização', 'Palete',
      'Colis/Set', 'Sets Completos', 'Distribuição Colis', 'Colis Faltantes', 'Detalhes'
    ];

    exportToExcel([headers, ...rows], `produtos_incompletos_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.xlsx`, 'Incompletos');
    toast.success(`${rows.length} produtos incompletos exportados para Excel`);
  }, [filteredProducts, getColisDistribution, getMissingColisInfo, exportToExcel]);

  // Export complete products to Excel
  const exportCompleteReportExcel = useCallback(() => {
    const complete = filteredProducts.filter(p => p.completeSets > 0 && !p.hasPartialProduct);
    
    if (complete.length === 0) {
      toast.info('Nenhum produto 100% completo para exportar');
      return;
    }

    const headers = [
      'Código', 'Nome', 'Categoria', 'Localização', 'Palete',
      'Colis/Set', 'Sets Completos', 'Distribuição Colis'
    ];

    const rows = complete.map(product => {
      const locations = product.uniqueLocations.length > 0 
        ? product.uniqueLocations.join(', ') 
        : (product.location || '-');
      
      const pallets = product.uniquePallets.length > 0 
        ? product.uniquePallets.join(', ') 
        : (product.pallet_number || '-');

      return [
        product.code, product.name, product.category, locations, pallets,
        product.total_colis, product.completeSets, getColisDistribution(product)
      ];
    });

    const totalSets = complete.reduce((sum, p) => sum + p.completeSets, 0);
    const summaryRow: (string | number)[] = ['TOTAL', '', '', '', '', complete.length + ' produtos', totalSets + ' sets', ''];

    exportToExcel([headers, ...rows, [], summaryRow], `produtos_completos_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.xlsx`, 'Completos');
    toast.success(`${complete.length} produtos completos exportados para Excel`);
  }, [filteredProducts, getColisDistribution, exportToExcel]);

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

  if (!selectedSessionId) {
    return (
      <div className="p-4 space-y-6">
        <div className="text-center py-12">
          <Package className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Selecione ou crie uma sessão de contagem</h2>
          <p className="text-muted-foreground mb-6">
            Cada sessão mantém um registo separado das contagens
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 max-w-md mx-auto">
            {activeSessions.length > 0 && (
              <Select onValueChange={handleSessionChange}>
                <SelectTrigger className="w-full sm:w-64">
                  <SelectValue placeholder="Selecionar sessão existente" />
                </SelectTrigger>
                <SelectContent>
                  {activeSessions.map(session => (
                    <SelectItem key={session.id} value={session.id}>
                      {session.name} {session.category !== 'Todas' && `(${session.category})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Nova sessão
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nova Sessão de Contagem</DialogTitle>
                  <DialogDescription>
                    Crie uma nova sessão para iniciar a contagem de stock
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Nome da sessão</Label>
                    <Input
                      placeholder="Ex: Inventário Janeiro 2026"
                      value={newSessionName}
                      onChange={(e) => setNewSessionName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-3">
                    <Label>Categorias de produtos</Label>
                    
                    <div className="flex items-center space-x-2 p-3 border rounded-lg bg-muted/50">
                      <Checkbox 
                        id="all-categories"
                        checked={allCategoriesSelected}
                        onCheckedChange={(checked) => handleToggleAllCategories(checked as boolean)}
                      />
                      <label htmlFor="all-categories" className="text-sm font-medium cursor-pointer">
                        Todas as categorias
                      </label>
                    </div>
                    
                    {!allCategoriesSelected && (
                      <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-3">
                        {availableCategories.map(cat => (
                          <div key={cat} className="flex items-center space-x-2">
                            <Checkbox 
                              id={`cat-${cat}`}
                              checked={newSessionCategories.includes(cat)}
                              onCheckedChange={() => handleToggleCategory(cat)}
                            />
                            <label htmlFor={`cat-${cat}`} className="text-sm cursor-pointer">
                              {cat}
                            </label>
                          </div>
                        ))}
                        {availableCategories.length === 0 && (
                          <p className="text-sm text-muted-foreground">Nenhuma categoria disponível</p>
                        )}
                      </div>
                    )}
                    
                    {!allCategoriesSelected && newSessionCategories.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {newSessionCategories.map(cat => (
                          <span key={cat} className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                            {cat}
                          </span>
                        ))}
                      </div>
                    )}
                    
                    <p className="text-xs text-muted-foreground">
                      {allCategoriesSelected 
                        ? 'Todos os produtos serão mostrados na sessão'
                        : newSessionCategories.length > 0
                          ? `Apenas produtos das categorias selecionadas (${newSessionCategories.length}) serão mostrados`
                          : 'Selecione pelo menos uma categoria'
                      }
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button 
                    onClick={handleCreateSession} 
                    disabled={!newSessionName.trim() || isCreatingSession || (!allCategoriesSelected && newSessionCategories.length === 0)}
                  >
                    Criar sessão
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    );
  }


  return (
    <div className="p-4 space-y-4">
      {/* Session header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-semibold">{currentSession?.name}</h2>
            {currentSession?.category !== 'Todas' && (
              <>
                {currentSession?.category.split(',').map((cat, i) => (
                  <span key={i} className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                    <Tags className="h-3 w-3 mr-1" />
                    {cat.trim()}
                  </span>
                ))}
              </>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Sessão ativa • {sessionFilteredProducts.length} produtos
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => {
          setSelectedSessionId(null);
          localStorage.removeItem(STORAGE_KEY);
          window.dispatchEvent(new CustomEvent('session-changed'));
        }}>
          Mudar sessão
        </Button>
      </div>

      {/* Summary */}
      <CountingSummary products={sessionFilteredProducts} />

      {/* Search and filters */}
      <div className="flex flex-col gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar por nome, código, localização ou palete..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className={`w-full sm:w-48 transition-colors ${filterStatus !== 'all' ? 'border-primary bg-primary/10 text-primary' : ''}`}>
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status ({sessionFilteredProducts.length})</SelectItem>
              <SelectItem value="incomplete">Incompletos ({statusCounts.incomplete})</SelectItem>
              <SelectItem value="complete">Completos ({statusCounts.complete})</SelectItem>
              <SelectItem value="excess">Excesso ({statusCounts.excess})</SelectItem>
              <SelectItem value="not_counted">Não contados ({statusCounts.notCounted})</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className={`w-full sm:w-48 transition-colors ${filterCategory !== 'all' ? 'border-primary bg-primary/10 text-primary' : ''}`}>
              <Tags className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas categorias ({sessionFilteredProducts.length})</SelectItem>
              {categoriesWithCounts.map(({ name, count }) => (
                <SelectItem key={name} value={name}>{name} ({count})</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterLocation} onValueChange={setFilterLocation}>
            <SelectTrigger className={`w-full sm:w-48 transition-colors ${filterLocation !== 'all' ? 'border-primary bg-primary/10 text-primary' : ''}`}>
              <MapPin className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Localização" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas localizações ({sessionFilteredProducts.length})</SelectItem>
              {productsWithoutLocation > 0 && (
                <SelectItem value="__empty__">Sem localização ({productsWithoutLocation})</SelectItem>
              )}
              {locationsWithCounts.map(({ name, count }) => (
                <SelectItem key={name} value={name}>{name} ({count})</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterPallet} onValueChange={setFilterPallet}>
            <SelectTrigger className={`w-full sm:w-48 transition-colors ${filterPallet !== 'all' ? 'border-primary bg-primary/10 text-primary' : ''}`}>
              <Box className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Palete" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos paletes ({sessionFilteredProducts.length})</SelectItem>
              {productsWithoutPallet > 0 && (
                <SelectItem value="__empty__">Sem palete ({productsWithoutPallet})</SelectItem>
              )}
              {palletsWithCounts.map(({ name, count }) => (
                <SelectItem key={name} value={name}>{name} ({count})</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Clear filters button */}
          {(filterStatus !== 'all' || filterLocation !== 'all' || filterPallet !== 'all' || filterCategory !== 'all' || searchTerm !== '') && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                setFilterStatus('all');
                setFilterLocation('all');
                setFilterPallet('all');
                setFilterCategory('all');
                setSearchTerm('');
              }}
              className="whitespace-nowrap"
            >
              <X className="h-4 w-4 mr-1" />
              Limpar filtros
            </Button>
          )}

          {/* Export dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="whitespace-nowrap">
                <Download className="h-4 w-4 mr-1" />
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
                  <DropdownMenuItem onClick={exportFilteredReport}>
                    <Package className="h-4 w-4 mr-2" />
                    Relatório Completo ({filteredProducts.length})
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportCompleteReport}>
                    <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" />
                    Só Completos ({completeProducts.filter(p => !p.hasPartialProduct).length})
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportIncompleteReport}>
                    <AlertCircle className="h-4 w-4 mr-2 text-amber-600" />
                    Só Incompletos
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
                  <DropdownMenuItem onClick={exportFilteredReportExcel}>
                    <Package className="h-4 w-4 mr-2" />
                    Relatório Completo ({filteredProducts.length})
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportCompleteReportExcel}>
                    <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" />
                    Só Completos ({completeProducts.filter(p => !p.hasPartialProduct).length})
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportIncompleteReportExcel}>
                    <AlertCircle className="h-4 w-4 mr-2 text-amber-600" />
                    Só Incompletos
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Products organized by status */}
      <Tabs defaultValue="all" className="w-full">
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="all" className="flex items-center gap-1">
            <Package className="h-4 w-4" />
            Todos ({filteredProducts.length})
          </TabsTrigger>
          <TabsTrigger value="incomplete" className="flex items-center gap-1">
            <AlertCircle className="h-4 w-4" />
            Incompletos ({incompleteProducts.length})
          </TabsTrigger>
          <TabsTrigger value="complete" className="flex items-center gap-1">
            <CheckCircle2 className="h-4 w-4" />
            Completos ({completeProducts.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProducts.map(product => (
              <ProductCard
                key={product.id}
                product={product}
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
                damagedStock={getDamagesForProduct(product.id).reduce((sum, d) => sum + d.quantity, 0)}
                colisNames={categoryColisNamesMap[product.category]}
                sessionId={selectedSessionId || undefined}
                requiresOrderNumber={categoriesRequiringOrder[product.category]}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="incomplete" className="mt-4">
          {incompleteProducts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500" />
              <p>Nenhum produto incompleto!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {incompleteProducts.map(product => (
                <ProductCard
                  key={product.id}
                  product={product}
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
                  damagedStock={getDamagesForProduct(product.id).reduce((sum, d) => sum + d.quantity, 0)}
                  colisNames={categoryColisNamesMap[product.category]}
                  sessionId={selectedSessionId || undefined}
                  requiresOrderNumber={categoriesRequiringOrder[product.category]}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="complete" className="mt-4">
          {completeProducts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-4" />
              <p>Nenhum produto completo ainda</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {completeProducts.map(product => (
                <ProductCard
                  key={product.id}
                  product={product}
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
                  damagedStock={getDamagesForProduct(product.id).reduce((sum, d) => sum + d.quantity, 0)}
                  colisNames={categoryColisNamesMap[product.category]}
                  sessionId={selectedSessionId || undefined}
                  requiresOrderNumber={categoriesRequiringOrder[product.category]}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {filteredProducts.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="h-12 w-12 mx-auto mb-4" />
          <p>Nenhum produto encontrado</p>
          <p className="text-sm">Adicione produtos na aba "Produtos"</p>
        </div>
      )}
    </div>
  );
}
