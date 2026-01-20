import { useState, useMemo, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { 
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { 
  Map, 
  Package, 
  Forklift, 
  GripVertical, 
  MapPin,
  Box,
  ArrowRight,
  Filter,
  Layers,
  Search,
  X,
  Split
} from 'lucide-react';
import { useWarehouseMap, LocationWithProducts, ProductInLocation } from '@/hooks/useWarehouseMap';
import { useActiveSession } from '@/hooks/useActiveSession';
import { cn } from '@/lib/utils';

interface DragItem {
  countId: string;
  productId: string;
  productName: string;
  productCode: string;
  colisNumber: number;
  quantity: number;
  palletNumber: string | null;
  fromLocationCode: string;
  isSplitEntry: boolean;
  totalQuantityForColi: number;
}

interface ProductSearchResult {
  productId: string;
  productName: string;
  productCode: string;
  locationCode: string;
  locationId: string;
  colisCount: number;
  totalQuantity: number;
}

export function InteractiveWarehouseMap() {
  const { activeSession } = useActiveSession();
  const { aisles, levels, locations, mapGrid, isLoading, moveProduct, movePartialProduct } = useWarehouseMap(activeSession?.id);
  
  const [selectedLocation, setSelectedLocation] = useState<LocationWithProducts | null>(null);
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const [draggedItem, setDraggedItem] = useState<DragItem | null>(null);
  const [dropTargetCode, setDropTargetCode] = useState<string | null>(null);
  const [filterAisle, setFilterAisle] = useState<string>('all');
  const [filterLevel, setFilterLevel] = useState<string>('all');
  
  // Search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedLocationId, setHighlightedLocationId] = useState<string | null>(null);
  const highlightedRef = useRef<HTMLButtonElement>(null);

  // Build searchable product list
  const searchableProducts = useMemo(() => {
    const products: ProductSearchResult[] = [];
    locations.forEach(loc => {
      // Group products by productId in this location
      const productGroups: Record<string, { name: string; code: string; count: number; totalQty: number }> = {};
      loc.products.forEach(p => {
        const existing = productGroups[p.productId];
        if (existing) {
          existing.count++;
          existing.totalQty += p.quantity;
        } else {
          productGroups[p.productId] = { name: p.productName, code: p.productCode, count: 1, totalQty: p.quantity };
        }
      });
      
      Object.entries(productGroups).forEach(([productId, group]) => {
        products.push({
          productId,
          productName: group.name,
          productCode: group.code,
          locationCode: loc.code,
          locationId: loc.id,
          colisCount: group.count,
          totalQuantity: group.totalQty,
        });
      });
    });
    return products;
  }, [locations]);

  // Filter search results
  const filteredSearchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    return searchableProducts.filter(p => 
      p.productName.toLowerCase().includes(query) || 
      p.productCode.toLowerCase().includes(query)
    ).slice(0, 10);
  }, [searchableProducts, searchQuery]);

  // Scroll to highlighted location
  useEffect(() => {
    if (highlightedLocationId && highlightedRef.current) {
      highlightedRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightedLocationId]);

  // Clear highlight after 5 seconds
  useEffect(() => {
    if (highlightedLocationId) {
      const timer = setTimeout(() => setHighlightedLocationId(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [highlightedLocationId]);

  const handleSelectProduct = (result: ProductSearchResult) => {
    setHighlightedLocationId(result.locationId);
    setSearchOpen(false);
    setSearchQuery('');
  };

  const clearHighlight = () => {
    setHighlightedLocationId(null);
  };

  // Filter locations based on selected filters
  const filteredLocations = useMemo(() => {
    return locations.filter(loc => {
      if (filterAisle !== 'all' && loc.aisle_id !== filterAisle) return false;
      if (filterLevel !== 'all' && loc.level_id !== filterLevel) return false;
      return true;
    });
  }, [locations, filterAisle, filterLevel]);

  // Group locations by aisle and level for grid display
  const locationGrid = useMemo(() => {
    const grid: Record<string, Record<string, LocationWithProducts[]>> = {};
    
    // Sort levels by level_number descending (highest first)
    const sortedLevels = [...levels].sort((a, b) => b.level_number - a.level_number);
    
    sortedLevels.forEach(level => {
      grid[level.id] = {};
      aisles.forEach(aisle => {
        grid[level.id][aisle.id] = filteredLocations
          .filter(loc => loc.level_id === level.id && loc.aisle_id === aisle.id)
          .sort((a, b) => a.position_in_aisle - b.position_in_aisle);
      });
    });
    
    return grid;
  }, [filteredLocations, aisles, levels]);

  // Stats
  const stats = useMemo(() => {
    const totalLocations = locations.length;
    const occupiedLocations = locations.filter(l => l.totalColis > 0).length;
    const totalColis = locations.reduce((sum, l) => sum + l.totalColis, 0);
    const totalQuantity = locations.reduce((sum, l) => sum + l.totalQuantity, 0);
    const totalProducts = locations.reduce((sum, l) => sum + l.totalProducts, 0);
    const forkliftRequired = locations.filter(l => l.requiresForklift && l.totalColis > 0).length;
    const splitLocations = locations.filter(l => l.products.some(p => p.isSplitEntry)).length;
    return { totalLocations, occupiedLocations, totalColis, totalQuantity, totalProducts, forkliftRequired, splitLocations };
  }, [locations]);

  const handleDragStart = (item: DragItem) => {
    setDraggedItem(item);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDropTargetCode(null);
  };

  const handleDragOver = (e: React.DragEvent, locationCode: string) => {
    e.preventDefault();
    if (draggedItem && draggedItem.fromLocationCode !== locationCode) {
      setDropTargetCode(locationCode);
    }
  };

  const handleDragLeave = () => {
    setDropTargetCode(null);
  };

  const handleDrop = async (e: React.DragEvent, toLocationCode: string) => {
    e.preventDefault();
    if (!draggedItem || !activeSession) return;
    
    if (draggedItem.fromLocationCode !== toLocationCode) {
      // Use movePartialProduct for specific count record (handles split entries properly)
      await movePartialProduct(
        draggedItem.countId,
        toLocationCode
      );
    }
    
    handleDragEnd();
  };

  const handleLocationClick = (location: LocationWithProducts) => {
    setSelectedLocation(location);
    setLocationDialogOpen(true);
  };

  const getLocationColor = (location: LocationWithProducts, isHighlighted: boolean) => {
    if (isHighlighted) return 'bg-yellow-300 border-yellow-500 ring-4 ring-yellow-400 animate-pulse';
    if (location.totalColis === 0) return 'bg-muted/30 border-muted';
    // Check if any products are split entries
    const hasSplit = location.products.some(p => p.isSplitEntry);
    if (hasSplit) return 'bg-blue-100 border-blue-400 border-dashed';
    if (location.totalColis >= 5) return 'bg-primary/20 border-primary/50';
    if (location.totalColis >= 2) return 'bg-blue-100 border-blue-300';
    return 'bg-green-100 border-green-300';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (locations.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
        <Map className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p className="text-lg font-medium">Nenhuma localização configurada</p>
        <p className="text-sm">Configure ruas, níveis e localizações na aba "Configurar" primeiro.</p>
      </div>
    );
  }

  // Sort levels for display (highest first)
  const sortedLevels = [...levels].sort((a, b) => b.level_number - a.level_number);

  return (
    <>
      <div className="space-y-4">
        {/* Stats bar */}
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xl font-bold">{stats.totalLocations}</p>
                <p className="text-xs text-muted-foreground">Localizações</p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <Box className="h-4 w-4 text-blue-500" />
              <div>
                <p className="text-xl font-bold">{stats.occupiedLocations}</p>
                <p className="text-xs text-muted-foreground">Ocupadas</p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-green-500" />
              <div>
                <p className="text-xl font-bold">{stats.totalQuantity}</p>
                <p className="text-xs text-muted-foreground">Unidades</p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-purple-500" />
              <div>
                <p className="text-xl font-bold">{stats.totalProducts}</p>
                <p className="text-xs text-muted-foreground">Produtos</p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <Split className="h-4 w-4 text-blue-600" />
              <div>
                <p className="text-xl font-bold">{stats.splitLocations}</p>
                <p className="text-xs text-muted-foreground">C/ Parciais</p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <Forklift className="h-4 w-4 text-orange-500" />
              <div>
                <p className="text-xl font-bold">{stats.forkliftRequired}</p>
                <p className="text-xs text-muted-foreground">Empilhador</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Filters and Search */}
        <Card className="p-3">
          <div className="flex flex-wrap items-center gap-4">
            {/* Product Search */}
            <Popover open={searchOpen} onOpenChange={setSearchOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[250px] justify-start">
                  <Search className="h-4 w-4 mr-2 text-muted-foreground" />
                  <span className="text-muted-foreground">Buscar produto...</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0" align="start">
                <Command>
                  <CommandInput 
                    placeholder="Nome ou código do produto..." 
                    value={searchQuery}
                    onValueChange={setSearchQuery}
                  />
                  <CommandList>
                    <CommandEmpty>Nenhum produto encontrado.</CommandEmpty>
                    <CommandGroup heading="Produtos no armazém">
                      {filteredSearchResults.map((result, idx) => (
                        <CommandItem
                          key={`${result.productId}-${result.locationId}-${idx}`}
                          value={`${result.productName} ${result.productCode}`}
                          onSelect={() => handleSelectProduct(result)}
                          className="cursor-pointer"
                        >
                          <div className="flex flex-col flex-1">
                            <span className="font-medium">{result.productName}</span>
                            <span className="text-xs text-muted-foreground">
                              {result.productCode} • {result.colisCount} entrada{result.colisCount > 1 ? 's' : ''} • {result.totalQuantity} un
                            </span>
                          </div>
                          <Badge variant="outline" className="ml-2">
                            <MapPin className="h-3 w-3 mr-1" />
                            {result.locationCode}
                          </Badge>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {/* Highlighted location indicator */}
            {highlightedLocationId && (
              <Badge variant="default" className="bg-yellow-500 text-yellow-950 gap-1">
                <MapPin className="h-3 w-3" />
                {locations.find(l => l.id === highlightedLocationId)?.code} destacada
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-4 w-4 ml-1 hover:bg-yellow-600"
                  onClick={clearHighlight}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            )}

            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filtros:</span>
            </div>
            <Select value={filterAisle} onValueChange={setFilterAisle}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Todas as ruas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as ruas</SelectItem>
                {aisles.map(aisle => (
                  <SelectItem key={aisle.id} value={aisle.id}>
                    Rua {aisle.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterLevel} onValueChange={setFilterLevel}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Todos os níveis" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os níveis</SelectItem>
                {levels.map(level => (
                  <SelectItem key={level.id} value={level.id}>
                    {level.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {draggedItem && (
              <Badge variant="outline" className="animate-pulse bg-primary/10">
                <GripVertical className="h-3 w-3 mr-1" />
                Arrastando: {draggedItem.productCode} Coli {draggedItem.colisNumber}
                {draggedItem.isSplitEntry && ` (${draggedItem.quantity}/${draggedItem.totalQuantityForColi} un)`}
              </Badge>
            )}
          </div>
        </Card>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 px-3 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-muted/30 border border-muted" />
            <span className="text-muted-foreground">Vazia</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-green-100 border border-green-300" />
            <span className="text-muted-foreground">1 entrada</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-blue-100 border border-blue-300" />
            <span className="text-muted-foreground">2-4 entradas</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-primary/20 border border-primary/50" />
            <span className="text-muted-foreground">5+ entradas</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-blue-100 border-2 border-dashed border-blue-400" />
            <span className="text-muted-foreground">Stock parcial</span>
          </div>
          <div className="flex items-center gap-2">
            <Forklift className="h-4 w-4 text-orange-500" />
            <span className="text-muted-foreground">Precisa empilhador</span>
          </div>
        </div>

        {/* Visual Map Grid */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Map className="h-4 w-4" />
              Mapa Visual do Armazém
              {!activeSession && (
                <Badge variant="secondary" className="ml-2">
                  Sem sessão ativa - mostrando todas as contagens
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="w-full">
              <div className="min-w-[600px]">
                {/* Aisle headers */}
                <div className="flex mb-2">
                  <div className="w-20 flex-shrink-0" /> {/* Spacer for level labels */}
                  {aisles.map(aisle => (
                    <div 
                      key={aisle.id}
                      className="flex-1 text-center font-bold text-sm py-2 mx-1 rounded"
                      style={{ backgroundColor: `${aisle.color}20`, color: aisle.color }}
                    >
                      Rua {aisle.name}
                    </div>
                  ))}
                </div>

                {/* Grid rows by level */}
                <TooltipProvider>
                  {sortedLevels.map(level => (
                    <div key={level.id} className="flex mb-1">
                      {/* Level label */}
                      <div 
                        className="w-20 flex-shrink-0 flex items-center justify-center text-xs font-medium rounded-l mr-1"
                        style={{ backgroundColor: `${level.color}20`, color: level.color }}
                      >
                        <span className="flex items-center gap-1">
                          {level.short_name}
                          {level.requires_forklift && (
                            <Forklift className="h-3 w-3 text-orange-500" />
                          )}
                        </span>
                      </div>

                      {/* Locations for each aisle at this level */}
                      {aisles.map(aisle => {
                        const locs = locationGrid[level.id]?.[aisle.id] || [];
                        
                        return (
                          <div key={aisle.id} className="flex-1 flex gap-1 mx-1">
                            {locs.length === 0 ? (
                              <div className="flex-1 h-16 rounded border-2 border-dashed border-muted/50 flex items-center justify-center text-xs text-muted-foreground">
                                -
                              </div>
                            ) : (
                              locs.map(location => {
                                const isHighlighted = highlightedLocationId === location.id;
                                return (
                                  <Tooltip key={location.id}>
                                    <TooltipTrigger asChild>
                                      <button
                                        ref={isHighlighted ? highlightedRef : undefined}
                                        onClick={() => handleLocationClick(location)}
                                        onDragOver={(e) => handleDragOver(e, location.code)}
                                        onDragLeave={handleDragLeave}
                                        onDrop={(e) => handleDrop(e, location.code)}
                                        className={cn(
                                          "flex-1 min-w-[60px] h-16 rounded border-2 transition-all",
                                          "hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary",
                                          "flex flex-col items-center justify-center p-1",
                                          getLocationColor(location, isHighlighted),
                                          dropTargetCode === location.code && "ring-2 ring-primary ring-offset-2 scale-105"
                                        )}
                                      >
                                        <span className="font-bold text-xs">{location.code}</span>
                                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                          <Package className="h-2.5 w-2.5" />
                                          {location.totalQuantity}
                                          {location.products.some(p => p.isSplitEntry) && (
                                            <Split className="h-2.5 w-2.5 text-blue-600" />
                                          )}
                                        </div>
                                        {location.requiresForklift && (
                                          <Forklift className="h-3 w-3 text-orange-500 mt-0.5" />
                                        )}
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top">
                                      <div className="text-xs space-y-1">
                                        <p className="font-bold">{location.code}</p>
                                        <p>Rua {location.aisleName} • {location.levelName}</p>
                                        <p>{location.totalQuantity} unidades • {location.totalProducts} produtos</p>
                                        {location.products.some(p => p.isSplitEntry) && (
                                          <p className="text-blue-600">✂️ Contém stock parcial/dividido</p>
                                        )}
                                        {location.requiresForklift && (
                                          <p className="text-orange-500">🚜 Precisa empilhador</p>
                                        )}
                                        <p className="text-muted-foreground">Clique para detalhes</p>
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                );
                              })
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </TooltipProvider>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Location Details Dialog */}
      <Dialog open={locationDialogOpen} onOpenChange={setLocationDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              {selectedLocation?.code}
              {selectedLocation && (
                <>
                  <Badge variant="outline">
                    Rua {selectedLocation.aisleName}
                  </Badge>
                  <Badge 
                    variant="outline"
                    style={{ 
                      backgroundColor: `${selectedLocation.levelColor}20`,
                      borderColor: selectedLocation.levelColor 
                    }}
                  >
                    {selectedLocation.levelName}
                  </Badge>
                  {selectedLocation.requiresForklift && (
                    <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50">
                      <Forklift className="h-3 w-3 mr-1" />
                      Empilhador
                    </Badge>
                  )}
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedLocation && (
            <div className="flex-1 overflow-auto space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-4 gap-3">
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <p className="text-2xl font-bold">{selectedLocation.totalProducts}</p>
                  <p className="text-xs text-muted-foreground">Produtos</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-blue-50">
                  <p className="text-2xl font-bold text-blue-600">{selectedLocation.totalColis}</p>
                  <p className="text-xs text-muted-foreground">Entradas</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-purple-50">
                  <p className="text-2xl font-bold text-purple-600">{selectedLocation.totalQuantity}</p>
                  <p className="text-xs text-muted-foreground">Unidades</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-green-50">
                  <p className="text-2xl font-bold text-green-600">
                    {new Set(selectedLocation.products.map(p => p.palletNumber).filter(Boolean)).size}
                  </p>
                  <p className="text-xs text-muted-foreground">Paletes</p>
                </div>
              </div>

              {/* Products list */}
              {selectedLocation.products.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Localização vazia</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Produtos nesta localização:</p>
                  <ScrollArea className="h-[300px]">
                    <div className="space-y-2 pr-4">
                      {selectedLocation.products.map((product, idx) => (
                        <div
                          key={`${product.countId}-${idx}`}
                          draggable
                          onDragStart={() => handleDragStart({
                            ...product,
                            fromLocationCode: selectedLocation.code
                          })}
                          onDragEnd={handleDragEnd}
                          className={cn(
                            "flex items-center justify-between p-3 rounded-lg border bg-card",
                            "cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow",
                            product.isSplitEntry && "border-blue-300 bg-blue-50/50"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <GripVertical className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <div className="flex items-center gap-1">
                                <p className="font-medium text-sm">{product.productName}</p>
                                {product.isSplitEntry && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger>
                                        <Badge variant="outline" className="h-5 text-xs text-blue-600 border-blue-300 gap-0.5">
                                          <Split className="h-3 w-3" />
                                          Dividido
                                        </Badge>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>Este coli está dividido em múltiplas localizações</p>
                                        <p className="text-muted-foreground">
                                          {product.quantity} de {product.totalQuantityForColi} unidades aqui
                                        </p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {product.productCode} • Coli {product.colisNumber}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {product.palletNumber && (
                              <Badge variant="outline" className="text-xs">
                                {product.palletNumber}
                              </Badge>
                            )}
                            <Badge className={cn(
                              product.isSplitEntry 
                                ? "bg-blue-100 text-blue-700 hover:bg-blue-100" 
                                : ""
                            )}>
                              {product.quantity} un
                              {product.isSplitEntry && (
                                <span className="text-blue-500 ml-1">
                                  /{product.totalQuantityForColi}
                                </span>
                              )}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                  <p className="text-xs text-muted-foreground text-center pt-2">
                    <GripVertical className="h-3 w-3 inline mr-1" />
                    Arraste um produto para mover para outra localização
                    {selectedLocation.products.some(p => p.isSplitEntry) && (
                      <span className="block mt-1 text-blue-600">
                        <Split className="h-3 w-3 inline mr-1" />
                        Itens divididos: apenas a quantidade desta localização será movida
                      </span>
                    )}
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
