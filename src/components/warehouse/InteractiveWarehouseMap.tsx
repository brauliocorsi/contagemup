import { useState, useMemo, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
  Split,
  Truck,
  AlertTriangle,
  MoveRight,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { useWarehouseMap, LocationWithProducts, ProductInLocation } from '@/hooks/useWarehouseMap';
import { useWarehousePallets, WarehousePallet, WarehouseAisle } from '@/hooks/useWarehouseConfig';
import { useActiveSession } from '@/hooks/useActiveSession';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
  aisleId: string | null;
  colisCount: number;
  totalQuantity: number;
}

interface AisleStats {
  totalLocations: number;
  occupiedLocations: number;
  totalQuantity: number;
  totalProducts: number;
  totalColis: number;
}

export function InteractiveWarehouseMap() {
  const { activeSession } = useActiveSession();
  const { aisles, levels, locations, pallets, mapGrid, isLoading, moveProduct, movePartialProduct, refetch } = useWarehouseMap(activeSession?.id);
  const { pallets: warehousePallets, isLoading: palletsLoading } = useWarehousePallets();
  
  const [selectedLocation, setSelectedLocation] = useState<LocationWithProducts | null>(null);
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const [draggedItem, setDraggedItem] = useState<DragItem | null>(null);
  const [dropTargetCode, setDropTargetCode] = useState<string | null>(null);
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [filterPallet, setFilterPallet] = useState<string>('all');
  
  // Search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedLocationId, setHighlightedLocationId] = useState<string | null>(null);
  const [highlightedAisleId, setHighlightedAisleId] = useState<string | null>(null);
  const highlightedRef = useRef<HTMLButtonElement>(null);
  
  // Pallet search state
  const [palletSearchOpen, setPalletSearchOpen] = useState(false);
  const [palletSearchQuery, setPalletSearchQuery] = useState('');
  const [highlightedPallet, setHighlightedPallet] = useState<string | null>(null);
  
  // Pallet transfer dialog state
  const [palletTransferOpen, setPalletTransferOpen] = useState(false);
  const [selectedPalletForTransfer, setSelectedPalletForTransfer] = useState<string | null>(null);
  const [targetLocationForPallet, setTargetLocationForPallet] = useState<string>('');
  const [transferLoading, setTransferLoading] = useState(false);
  
  // Show products without location
  const [showNoLocationProducts, setShowNoLocationProducts] = useState(false);
  
  // Collapsed aisles state
  const [collapsedAisles, setCollapsedAisles] = useState<Set<string>>(new Set());

  const toggleAisleCollapse = (aisleId: string) => {
    setCollapsedAisles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(aisleId)) {
        newSet.delete(aisleId);
      } else {
        newSet.add(aisleId);
      }
      return newSet;
    });
  };

  const expandAllAisles = () => setCollapsedAisles(new Set());
  const collapseAllAisles = () => setCollapsedAisles(new Set(aisles.map(a => a.id)));

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
          aisleId: loc.aisle_id,
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

  // Scroll to highlighted aisle card when product is selected
  useEffect(() => {
    if (highlightedAisleId) {
      const aisleCard = document.getElementById(`aisle-card-${highlightedAisleId}`);
      if (aisleCard) {
        aisleCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [highlightedAisleId]);

  // Clear highlight after 5 seconds
  useEffect(() => {
    if (highlightedLocationId) {
      const timer = setTimeout(() => {
        setHighlightedLocationId(null);
        setHighlightedAisleId(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [highlightedLocationId]);

  const handleSelectProduct = (result: ProductSearchResult) => {
    setHighlightedLocationId(result.locationId);
    setHighlightedAisleId(result.aisleId);
    setSearchOpen(false);
    setSearchQuery('');
  };

  const clearHighlight = () => {
    setHighlightedLocationId(null);
    setHighlightedAisleId(null);
    setHighlightedPallet(null);
  };

  // Build searchable pallets list with their locations
  const searchablePallets = useMemo(() => {
    const palletsWithLocations: { code: string; locationCode: string; locationId: string; aisleId: string | null; productCount: number; totalQuantity: number }[] = [];
    
    locations.forEach(loc => {
      const palletGroups: Record<string, { count: number; qty: number }> = {};
      loc.products.forEach(p => {
        if (p.palletNumber) {
          const existing = palletGroups[p.palletNumber];
          if (existing) {
            existing.count++;
            existing.qty += p.quantity;
          } else {
            palletGroups[p.palletNumber] = { count: 1, qty: p.quantity };
          }
        }
      });
      
      Object.entries(palletGroups).forEach(([palletCode, data]) => {
        palletsWithLocations.push({
          code: palletCode,
          locationCode: loc.code,
          locationId: loc.id,
          aisleId: loc.aisle_id,
          productCount: data.count,
          totalQuantity: data.qty,
        });
      });
    });
    
    return palletsWithLocations;
  }, [locations]);

  // Get unique pallets with locations
  const uniquePalletsInWarehouse = useMemo(() => {
    const palletMap: Record<string, { locations: string[]; aisleIds: (string | null)[]; totalProducts: number; totalQuantity: number }> = {};
    
    searchablePallets.forEach(p => {
      const existing = palletMap[p.code];
      if (existing) {
        if (!existing.locations.includes(p.locationCode)) {
          existing.locations.push(p.locationCode);
        }
        if (p.aisleId && !existing.aisleIds.includes(p.aisleId)) {
          existing.aisleIds.push(p.aisleId);
        }
        existing.totalProducts += p.productCount;
        existing.totalQuantity += p.totalQuantity;
      } else {
        palletMap[p.code] = {
          locations: [p.locationCode],
          aisleIds: p.aisleId ? [p.aisleId] : [],
          totalProducts: p.productCount,
          totalQuantity: p.totalQuantity,
        };
      }
    });
    
    return Object.entries(palletMap).map(([code, data]) => ({
      code,
      ...data,
    }));
  }, [searchablePallets]);

  // Filter pallet search results
  const filteredPalletResults = useMemo(() => {
    if (!palletSearchQuery.trim()) return uniquePalletsInWarehouse.slice(0, 10);
    const query = palletSearchQuery.toLowerCase();
    return uniquePalletsInWarehouse
      .filter(p => p.code.toLowerCase().includes(query))
      .slice(0, 10);
  }, [uniquePalletsInWarehouse, palletSearchQuery]);

  // Get products without location
  const productsWithoutLocation = useMemo(() => {
    const noLocationProducts: ProductInLocation[] = [];
    locations.forEach(loc => {
      if (!loc.code || loc.code.trim() === '') {
        noLocationProducts.push(...loc.products);
      }
    });
    return noLocationProducts;
  }, [locations]);

  // Handle pallet selection
  const handleSelectPallet = (palletCode: string, firstAisleId: string | null) => {
    setHighlightedPallet(palletCode);
    setFilterPallet(palletCode);
    setPalletSearchOpen(false);
    setPalletSearchQuery('');
    
    // Scroll to first aisle containing this pallet
    if (firstAisleId) {
      setTimeout(() => {
        const aisleCard = document.getElementById(`aisle-card-${firstAisleId}`);
        if (aisleCard) {
          aisleCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  };

  // Open pallet transfer dialog
  const openPalletTransfer = (palletCode: string) => {
    setSelectedPalletForTransfer(palletCode);
    setTargetLocationForPallet('');
    setPalletTransferOpen(true);
  };

  // Handle pallet transfer
  const handlePalletTransfer = async () => {
    if (!selectedPalletForTransfer || !targetLocationForPallet.trim() || !activeSession) return;
    
    setTransferLoading(true);
    try {
      // Update all counts with this pallet to the new location
      const { error } = await supabase
        .from('counts')
        .update({ location: targetLocationForPallet.toUpperCase() })
        .eq('pallet_number', selectedPalletForTransfer)
        .eq('session_id', activeSession.id);
      
      if (error) throw error;
      
      toast.success(`Palete ${selectedPalletForTransfer} transferida para ${targetLocationForPallet.toUpperCase()}`);
      setPalletTransferOpen(false);
      setSelectedPalletForTransfer(null);
      refetch();
    } catch (error: any) {
      toast.error('Erro ao transferir palete: ' + error.message);
    } finally {
      setTransferLoading(false);
    }
  };

  // Filter locations based on selected filters
  const filteredLocations = useMemo(() => {
    return locations.filter(loc => {
      if (filterLevel !== 'all' && loc.level_id !== filterLevel) return false;
      if (filterPallet !== 'all') {
        const hasPallet = loc.products.some(p => p.palletNumber === filterPallet);
        if (!hasPallet) return false;
      }
      return true;
    });
  }, [locations, filterLevel, filterPallet]);

  // Get stats per aisle
  const getAisleStats = (aisleId: string): AisleStats => {
    const aisleLocations = filteredLocations.filter(l => l.aisle_id === aisleId);
    return {
      totalLocations: aisleLocations.length,
      occupiedLocations: aisleLocations.filter(l => l.totalColis > 0).length,
      totalQuantity: aisleLocations.reduce((sum, l) => sum + l.totalQuantity, 0),
      totalProducts: aisleLocations.reduce((sum, l) => sum + l.totalProducts, 0),
      totalColis: aisleLocations.reduce((sum, l) => sum + l.totalColis, 0),
    };
  };

  // Group locations by aisle and level for grid display
  const getLocationGrid = (aisleId: string) => {
    const grid: Record<string, LocationWithProducts[]> = {};
    
    // Sort levels by level_number descending (highest first)
    const sortedLevels = [...levels].sort((a, b) => b.level_number - a.level_number);
    
    sortedLevels.forEach(level => {
      grid[level.id] = filteredLocations
        .filter(loc => loc.level_id === level.id && loc.aisle_id === aisleId)
        .sort((a, b) => a.position_in_aisle - b.position_in_aisle);
    });
    
    return grid;
  };

  // Stats
  const stats = useMemo(() => {
    const totalLocations = locations.length;
    const occupiedLocations = locations.filter(l => l.totalColis > 0).length;
    const totalColis = locations.reduce((sum, l) => sum + l.totalColis, 0);
    const totalQuantity = locations.reduce((sum, l) => sum + l.totalQuantity, 0);
    const totalProducts = locations.reduce((sum, l) => sum + l.totalProducts, 0);
    const forkliftRequired = locations.filter(l => l.requiresForklift && l.totalColis > 0).length;
    const splitLocations = locations.filter(l => l.products.some(p => p.isSplitEntry)).length;
    const totalPallets = uniquePalletsInWarehouse.length;
    return { totalLocations, occupiedLocations, totalColis, totalQuantity, totalProducts, forkliftRequired, splitLocations, totalPallets };
  }, [locations, uniquePalletsInWarehouse]);

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
    
    // Check if location contains highlighted pallet
    if (highlightedPallet && location.products.some(p => p.palletNumber === highlightedPallet)) {
      return 'bg-purple-200 border-purple-500 ring-2 ring-purple-400';
    }
    
    if (location.totalColis === 0) return 'bg-muted/30 border-muted';
    // Check if any products are split entries
    const hasSplit = location.products.some(p => p.isSplitEntry);
    if (hasSplit) return 'bg-blue-100 border-blue-400 border-dashed';
    if (location.totalColis >= 5) return 'bg-primary/20 border-primary/50';
    if (location.totalColis >= 2) return 'bg-blue-100 border-blue-300';
    return 'bg-green-100 border-green-300';
  };

  // Sort levels for display (highest first)
  const sortedLevels = useMemo(() => [...levels].sort((a, b) => b.level_number - a.level_number), [levels]);

  // Filter aisles that have locations after applying filters
  const aislesWithLocations = useMemo(() => {
    return aisles.filter(aisle => {
      const aisleStats = getAisleStats(aisle.id);
      return aisleStats.totalLocations > 0;
    });
  }, [aisles, filteredLocations]);

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

  return (
    <>
      <div className="space-y-4">
        {/* Stats bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
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
              <Truck className="h-4 w-4 text-purple-500" />
              <div>
                <p className="text-xl font-bold">{stats.totalPallets}</p>
                <p className="text-xs text-muted-foreground">Paletes</p>
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
                <Button variant="outline" className="w-[200px] justify-start">
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

            {/* Pallet Search */}
            <Popover open={palletSearchOpen} onOpenChange={setPalletSearchOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[200px] justify-start">
                  <Truck className="h-4 w-4 mr-2 text-muted-foreground" />
                  <span className="text-muted-foreground">Buscar palete...</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[350px] p-0" align="start">
                <Command>
                  <CommandInput 
                    placeholder="Código da palete..." 
                    value={palletSearchQuery}
                    onValueChange={setPalletSearchQuery}
                  />
                  <CommandList>
                    <CommandEmpty>Nenhuma palete encontrada.</CommandEmpty>
                    <CommandGroup heading="Paletes no armazém">
                      {filteredPalletResults.map((pallet, idx) => (
                        <CommandItem
                          key={`${pallet.code}-${idx}`}
                          value={pallet.code}
                          onSelect={() => handleSelectPallet(pallet.code, pallet.aisleIds[0] || null)}
                          className="cursor-pointer"
                        >
                          <div className="flex flex-col flex-1">
                            <span className="font-medium flex items-center gap-2">
                              <Truck className="h-3 w-3" />
                              {pallet.code}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {pallet.totalProducts} entradas • {pallet.totalQuantity} un • {pallet.locations.length} localização{pallet.locations.length > 1 ? 'ões' : ''}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            {pallet.locations.slice(0, 2).map((loc, i) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                {loc}
                              </Badge>
                            ))}
                            {pallet.locations.length > 2 && (
                              <Badge variant="secondary" className="text-xs">
                                +{pallet.locations.length - 2}
                              </Badge>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 ml-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              openPalletTransfer(pallet.code);
                            }}
                          >
                            <MoveRight className="h-3 w-3" />
                          </Button>
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

            {/* Highlighted pallet indicator */}
            {highlightedPallet && (
              <Badge variant="default" className="bg-purple-500 text-purple-950 gap-1">
                <Truck className="h-3 w-3" />
                Palete {highlightedPallet}
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-4 w-4 ml-1 hover:bg-purple-600"
                  onClick={() => {
                    setHighlightedPallet(null);
                    setFilterPallet('all');
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-4 w-4 hover:bg-purple-600"
                  onClick={() => openPalletTransfer(highlightedPallet)}
                  title="Transferir palete"
                >
                  <MoveRight className="h-3 w-3" />
                </Button>
              </Badge>
            )}

            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filtros:</span>
            </div>
            <Select value={filterLevel} onValueChange={setFilterLevel}>
              <SelectTrigger className="w-[130px]">
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
            <Select value={filterPallet} onValueChange={setFilterPallet}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Todas as paletes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as paletes</SelectItem>
                {uniquePalletsInWarehouse.map(pallet => (
                  <SelectItem key={pallet.code} value={pallet.code}>
                    <span className="flex items-center gap-1">
                      <Truck className="h-3 w-3" />
                      {pallet.code}
                    </span>
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
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-purple-500" />
            <span className="text-muted-foreground">Palete destacada</span>
          </div>
        </div>

        {/* Products Without Location Warning */}
        {productsWithoutLocation.length > 0 && (
          <Card className="p-4 border-amber-300 bg-amber-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                <div>
                  <p className="font-medium text-amber-800">
                    {productsWithoutLocation.length} entrada{productsWithoutLocation.length > 1 ? 's' : ''} sem localização
                  </p>
                  <p className="text-sm text-amber-600">
                    Estes produtos não têm localização definida no armazém
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-amber-400 text-amber-700 hover:bg-amber-100"
                onClick={() => setShowNoLocationProducts(!showNoLocationProducts)}
              >
                {showNoLocationProducts ? 'Ocultar' : 'Ver detalhes'}
              </Button>
            </div>
            {showNoLocationProducts && (
              <div className="mt-4 space-y-2">
                <ScrollArea className="h-[200px]">
                  <div className="space-y-2">
                    {productsWithoutLocation.map((product, idx) => (
                      <div
                        key={`${product.countId}-${idx}`}
                        className="flex items-center justify-between p-2 rounded bg-white border border-amber-200"
                      >
                        <div>
                          <p className="font-medium text-sm">{product.productName}</p>
                          <p className="text-xs text-muted-foreground">
                            {product.productCode} • Coli {product.colisNumber}
                          </p>
                        </div>
                        <Badge variant="outline">{product.quantity} un</Badge>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </Card>
        )}

        {/* Session info and expand/collapse controls */}
        <div className="flex items-center justify-between">
          {!activeSession && (
            <Badge variant="secondary">
              Sem sessão ativa - mostrando todas as contagens
            </Badge>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={expandAllAisles}
              disabled={collapsedAisles.size === 0}
            >
              <ChevronDown className="h-4 w-4 mr-1" />
              Expandir Todas
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={collapseAllAisles}
              disabled={collapsedAisles.size === aislesWithLocations.length}
            >
              <ChevronRight className="h-4 w-4 mr-1" />
              Recolher Todas
            </Button>
          </div>
        </div>

        {/* Visual Map - Separate Cards per Aisle */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {aislesWithLocations.map(aisle => {
            const aisleStats = getAisleStats(aisle.id);
            const locationGrid = getLocationGrid(aisle.id);
            const isHighlightedAisle = highlightedAisleId === aisle.id;
            const isCollapsed = collapsedAisles.has(aisle.id);

            return (
              <Collapsible
                key={aisle.id}
                open={!isCollapsed}
                onOpenChange={() => toggleAisleCollapse(aisle.id)}
              >
                <Card
                  id={`aisle-card-${aisle.id}`}
                  className={cn(
                    "transition-all",
                    isHighlightedAisle && "ring-2 ring-yellow-400 shadow-lg"
                  )}
                >
                  <CardHeader 
                    className="pb-2"
                    style={{ borderLeft: `4px solid ${aisle.color || 'hsl(var(--primary))'}` }}
                  >
                    <CollapsibleTrigger asChild>
                      <CardTitle className="text-base flex items-center justify-between cursor-pointer hover:bg-muted/50 -mx-2 px-2 py-1 rounded transition-colors">
                        <div className="flex items-center gap-2">
                          {isCollapsed ? (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                          <Map className="h-4 w-4" />
                          Rua {aisle.name}
                        </div>
                        <div className="flex items-center gap-2 text-xs font-normal">
                          <Badge variant="outline" className="text-xs">
                            <MapPin className="h-3 w-3 mr-1" />
                            {aisleStats.occupiedLocations}/{aisleStats.totalLocations}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            <Package className="h-3 w-3 mr-1" />
                            {aisleStats.totalQuantity} un
                          </Badge>
                        </div>
                      </CardTitle>
                    </CollapsibleTrigger>
                  </CardHeader>
                  <CollapsibleContent>
                    <CardContent className="pt-2 animate-accordion-down">
                      <TooltipProvider>
                        <div className="space-y-1">
                          {sortedLevels.map(level => {
                            const locs = locationGrid[level.id] || [];
                            if (locs.length === 0 && filterLevel === 'all') return null;
                            if (filterLevel !== 'all' && filterLevel !== level.id) return null;

                            return (
                              <div key={level.id} className="flex items-stretch gap-1">
                                {/* Level label */}
                                <div 
                                  className="w-14 flex-shrink-0 flex items-center justify-center text-xs font-medium rounded px-1"
                                  style={{ backgroundColor: `${level.color}20`, color: level.color || 'inherit' }}
                                >
                                  <span className="flex items-center gap-1">
                                    {level.short_name}
                                    {level.requires_forklift && (
                                      <Forklift className="h-3 w-3 text-orange-500" />
                                    )}
                                  </span>
                                </div>

                                {/* Locations for this level */}
                                <div className="flex-1 flex gap-1 flex-wrap">
                                  {locs.length === 0 ? (
                                    <div className="flex-1 h-14 rounded border-2 border-dashed border-muted/50 flex items-center justify-center text-xs text-muted-foreground min-w-[60px]">
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
                                                "min-w-[60px] h-14 rounded border-2 transition-all",
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
                              </div>
                            );
                          })}
                        </div>
                      </TooltipProvider>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            );
          })}
        </div>
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

      {/* Pallet Transfer Dialog */}
      <Dialog open={palletTransferOpen} onOpenChange={setPalletTransferOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              Transferir Palete
            </DialogTitle>
          </DialogHeader>
          
          {selectedPalletForTransfer && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 mb-2">
                  <Truck className="h-4 w-4 text-purple-600" />
                  <span className="font-bold">{selectedPalletForTransfer}</span>
                </div>
                {(() => {
                  const palletInfo = uniquePalletsInWarehouse.find(p => p.code === selectedPalletForTransfer);
                  if (!palletInfo) return null;
                  return (
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p>{palletInfo.totalProducts} entrada{palletInfo.totalProducts > 1 ? 's' : ''} • {palletInfo.totalQuantity} unidades</p>
                      <p>Localização atual: {palletInfo.locations.join(', ')}</p>
                    </div>
                  );
                })()}
              </div>

              <div className="space-y-2">
                <Label htmlFor="target-location">Nova localização</Label>
                <div className="flex gap-2">
                  <Select value={targetLocationForPallet} onValueChange={setTargetLocationForPallet}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Selecionar localização..." />
                    </SelectTrigger>
                    <SelectContent>
                      {locations
                        .filter(loc => loc.code && loc.code.trim() !== '')
                        .map(loc => (
                          <SelectItem key={loc.id} value={loc.code}>
                            <span className="flex items-center gap-2">
                              <MapPin className="h-3 w-3" />
                              {loc.code}
                              <span className="text-muted-foreground text-xs">
                                ({loc.aisleName} - {loc.levelShortName})
                              </span>
                              {loc.requiresForklift && (
                                <Forklift className="h-3 w-3 text-orange-500" />
                              )}
                            </span>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">
                  Todos os produtos desta palete serão movidos para a nova localização
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPalletTransferOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handlePalletTransfer}
              disabled={!targetLocationForPallet || transferLoading}
            >
              {transferLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Transferindo...
                </>
              ) : (
                <>
                  <MoveRight className="h-4 w-4 mr-2" />
                  Transferir
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
