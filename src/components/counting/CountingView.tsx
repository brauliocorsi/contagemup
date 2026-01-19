import { useState, useMemo } from 'react';
import { useProducts } from '@/hooks/useProducts';
import { useCounting } from '@/hooks/useCounting';
import { useSessions } from '@/hooks/useSessions';
import { useCategories } from '@/hooks/useCategories';
import { ProductCard } from './ProductCard';
import { CountingSummary } from './CountingSummary';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Plus, Filter, Package, AlertCircle, CheckCircle2, Tags, MapPin, Box } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';

export function CountingView() {
  const { products, loading: productsLoading, updateProduct, fetchProducts } = useProducts();
  const { sessions, loading: sessionsLoading, createSession } = useSessions();
  const { categories, loading: categoriesLoading } = useCategories();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterLocation, setFilterLocation] = useState<string>('all');
  const [filterPallet, setFilterPallet] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [newSessionName, setNewSessionName] = useState('');
  const [newSessionCategories, setNewSessionCategories] = useState<string[]>([]);
  const [allCategoriesSelected, setAllCategoriesSelected] = useState(true);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { incrementCount, decrementCount, updateLocation, updatePalletNumber, getProductWithCounts, deleteOrphanCounts, loading: countingLoading } = useCounting(selectedSessionId);

  const activeSessions = sessions.filter(s => s.status === 'active');

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
      setSelectedSessionId(session.id);
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

  const productsWithCounts = useMemo(() => {
    return products.map(p => getProductWithCounts(p));
  }, [products, getProductWithCounts]);

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

  // Extract unique locations and pallets from products for filters
  const uniqueLocations = useMemo(() => {
    const locations = sessionFilteredProducts
      .map(p => p.location)
      .filter((loc): loc is string => loc !== null && loc !== undefined && loc.trim() !== '');
    return [...new Set(locations)].sort();
  }, [sessionFilteredProducts]);

  const uniquePallets = useMemo(() => {
    const pallets = sessionFilteredProducts
      .map(p => p.pallet_number)
      .filter((pallet): pallet is string => pallet !== null && pallet !== undefined && pallet.trim() !== '');
    return [...new Set(pallets)].sort();
  }, [sessionFilteredProducts]);

  const filteredProducts = useMemo(() => {
    return sessionFilteredProducts.filter(product => {
      const matchesSearch = 
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.pallet_number?.toLowerCase().includes(searchTerm.toLowerCase());

      const isCompleteEnough = product.completeSets > 0;
      const isPending = product.hasPartialProduct;

      const matchesFilter =
        filterStatus === 'all' ||
        (filterStatus === 'complete' && isCompleteEnough) ||
        (filterStatus === 'incomplete' && isPending) ||
        (filterStatus !== 'complete' && filterStatus !== 'incomplete' && product.status === filterStatus);

      const matchesLocation = filterLocation === 'all' || product.location === filterLocation;
      const matchesPallet = filterPallet === 'all' || product.pallet_number === filterPallet;

      return matchesSearch && matchesFilter && matchesLocation && matchesPallet;
    });
  }, [sessionFilteredProducts, searchTerm, filterStatus, filterLocation, filterPallet]);

  const incompleteProducts = filteredProducts.filter(p => p.hasPartialProduct);
  const completeProducts = filteredProducts.filter(p => p.completeSets > 0);
  const otherProducts = filteredProducts.filter(p => !p.hasPartialProduct && p.completeSets === 0);

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
              <Select onValueChange={setSelectedSessionId}>
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
        <Button variant="outline" size="sm" onClick={() => setSelectedSessionId(null)}>
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
            <SelectTrigger className="w-full sm:w-40">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              <SelectItem value="incomplete">Incompletos</SelectItem>
              <SelectItem value="complete">Completos</SelectItem>
              <SelectItem value="excess">Excesso</SelectItem>
              <SelectItem value="not_counted">Não contados</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterLocation} onValueChange={setFilterLocation}>
            <SelectTrigger className="w-full sm:w-44">
              <MapPin className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Localização" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas localizações</SelectItem>
              {uniqueLocations.map(loc => (
                <SelectItem key={loc} value={loc}>{loc}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterPallet} onValueChange={setFilterPallet}>
            <SelectTrigger className="w-full sm:w-40">
              <Box className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Palete" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos paletes</SelectItem>
              {uniquePallets.map(pallet => (
                <SelectItem key={pallet} value={pallet}>{pallet}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
                onLocationChange={updateLocation}
                onPalletChange={updatePalletNumber}
                onAddColi={handleAddColi}
                onRemoveColi={handleRemoveColi}
                colisNames={categoryColisNamesMap[product.category]}
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
                  onLocationChange={updateLocation}
                  onPalletChange={updatePalletNumber}
                  onAddColi={handleAddColi}
                  onRemoveColi={handleRemoveColi}
                  colisNames={categoryColisNamesMap[product.category]}
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
                  onLocationChange={updateLocation}
                  onPalletChange={updatePalletNumber}
                  onAddColi={handleAddColi}
                  onRemoveColi={handleRemoveColi}
                  colisNames={categoryColisNamesMap[product.category]}
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
