import { useState, useMemo } from 'react';
import { useProducts } from '@/hooks/useProducts';
import { useCounting } from '@/hooks/useCounting';
import { useSessions } from '@/hooks/useSessions';
import { ProductCard } from './ProductCard';
import { CountingSummary } from './CountingSummary';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Plus, Filter, Package, AlertCircle, CheckCircle2, Tags } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { PRODUCT_CATEGORIES } from '@/types/stock';

export function CountingView() {
  const { products, loading: productsLoading } = useProducts();
  const { sessions, loading: sessionsLoading, createSession } = useSessions();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [newSessionName, setNewSessionName] = useState('');
  const [newSessionCategory, setNewSessionCategory] = useState('Todas');
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { incrementCount, decrementCount, getProductWithCounts, loading: countingLoading } = useCounting(selectedSessionId);

  const activeSessions = sessions.filter(s => s.status === 'active');

  // Get unique categories from products
  const availableCategories = useMemo(() => {
    const categories = [...new Set(products.map(p => p.category))];
    return categories.sort();
  }, [products]);

  const handleCreateSession = async () => {
    if (!newSessionName.trim()) return;
    setIsCreatingSession(true);
    const session = await createSession(newSessionName, newSessionCategory);
    if (session) {
      setSelectedSessionId(session.id);
      setNewSessionName('');
      setNewSessionCategory('Todas');
      setDialogOpen(false);
    }
    setIsCreatingSession(false);
  };

  const productsWithCounts = useMemo(() => {
    return products.map(p => getProductWithCounts(p));
  }, [products, getProductWithCounts]);

  // Get current session
  const currentSession = sessions.find(s => s.id === selectedSessionId);

  // Filter products based on session category first
  const sessionFilteredProducts = useMemo(() => {
    if (!currentSession || currentSession.category === 'Todas') {
      return productsWithCounts;
    }
    return productsWithCounts.filter(p => p.category === currentSession.category);
  }, [productsWithCounts, currentSession]);

  const filteredProducts = useMemo(() => {
    return sessionFilteredProducts.filter(product => {
      const matchesSearch = 
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.code.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesFilter = 
        filterStatus === 'all' ||
        product.status === filterStatus;

      return matchesSearch && matchesFilter;
    });
  }, [sessionFilteredProducts, searchTerm, filterStatus]);

  const incompleteProducts = filteredProducts.filter(p => p.status === 'incomplete');
  const completeProducts = filteredProducts.filter(p => p.status === 'complete');
  const otherProducts = filteredProducts.filter(p => p.status !== 'incomplete' && p.status !== 'complete');

  if (productsLoading || sessionsLoading) {
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
                  <div className="space-y-2">
                    <Label>Categoria de produtos</Label>
                    <Select value={newSessionCategory} onValueChange={setNewSessionCategory}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar categoria" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Todas">Todas as categorias</SelectItem>
                        {availableCategories.map(cat => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Apenas produtos desta categoria serão mostrados na sessão
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleCreateSession} disabled={!newSessionName.trim() || isCreatingSession}>
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
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{currentSession?.name}</h2>
            {currentSession?.category !== 'Todas' && (
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                <Tags className="h-3 w-3 mr-1" />
                {currentSession?.category}
              </span>
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
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar por nome ou código..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-full sm:w-48">
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
