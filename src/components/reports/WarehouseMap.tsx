import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Map, ChevronDown, ChevronUp, Package, MapPin, CheckCircle2, AlertCircle, Box, Eye } from 'lucide-react';
import { ProductWithCounts } from '@/types/stock';
import { cn } from '@/lib/utils';

interface WarehouseMapProps {
  productsWithCounts: ProductWithCounts[];
  onProductClick?: (productId: string) => void;
}

interface ZoneData {
  name: string;
  products: ProductWithCounts[];
  totalProducts: number;
  totalSets: number;
  completeProducts: number;
  incompleteProducts: number;
  status: 'complete' | 'partial' | 'incomplete' | 'empty';
  completionPercentage: number;
}

export function WarehouseMap({ productsWithCounts, onProductClick }: WarehouseMapProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [selectedZone, setSelectedZone] = useState<ZoneData | null>(null);
  const [zoneDialogOpen, setZoneDialogOpen] = useState(false);

  // Group products by location
  const zones = useMemo(() => {
    const locationMap: Record<string, ProductWithCounts[]> = {};

    productsWithCounts.forEach(product => {
      // Get all unique locations for this product
      const locations = product.uniqueLocations.length > 0 
        ? product.uniqueLocations 
        : [product.location || 'Sem localização'];

      locations.forEach(loc => {
        if (!locationMap[loc]) {
          locationMap[loc] = [];
        }
        const existing = locationMap[loc];
        if (!existing.find(p => p.id === product.id)) {
          existing.push(product);
        }
      });
    });

    const zonesArray: ZoneData[] = [];
    
    Object.entries(locationMap).forEach(([name, products]) => {
      const totalProducts = products.length;
      const totalSets = products.reduce((sum, p) => sum + p.completeSets, 0);
      const completeProducts = products.filter(p => p.completeSets > 0 && !p.hasPartialProduct).length;
      const incompleteProducts = products.filter(p => p.hasPartialProduct || (p.completeSets === 0 && p.status !== 'not_counted')).length;
      
      const completionPercentage = totalProducts > 0 
        ? Math.round((completeProducts / totalProducts) * 100) 
        : 0;

      let status: ZoneData['status'] = 'empty';
      if (totalProducts === 0) {
        status = 'empty';
      } else if (completeProducts === totalProducts) {
        status = 'complete';
      } else if (incompleteProducts > 0) {
        status = 'incomplete';
      } else {
        status = 'partial';
      }

      zonesArray.push({
        name,
        products,
        totalProducts,
        totalSets,
        completeProducts,
        incompleteProducts,
        status,
        completionPercentage
      });
    });

    // Sort: incomplete first, then partial, then complete
    return zonesArray.sort((a, b) => {
      const statusOrder = { incomplete: 0, partial: 1, complete: 2, empty: 3 };
      const orderDiff = statusOrder[a.status] - statusOrder[b.status];
      if (orderDiff !== 0) return orderDiff;
      return a.name.localeCompare(b.name);
    });
  }, [productsWithCounts]);

  // Stats
  const stats = useMemo(() => {
    const total = zones.length;
    const complete = zones.filter(z => z.status === 'complete').length;
    const incomplete = zones.filter(z => z.status === 'incomplete').length;
    const partial = zones.filter(z => z.status === 'partial').length;
    return { total, complete, incomplete, partial };
  }, [zones]);

  const getZoneColor = (status: ZoneData['status']) => {
    switch (status) {
      case 'complete':
        return 'bg-green-100 border-green-300 hover:bg-green-200';
      case 'partial':
        return 'bg-yellow-100 border-yellow-300 hover:bg-yellow-200';
      case 'incomplete':
        return 'bg-red-100 border-red-300 hover:bg-red-200';
      case 'empty':
      default:
        return 'bg-muted/50 border-muted hover:bg-muted';
    }
  };

  const getStatusIcon = (status: ZoneData['status']) => {
    switch (status) {
      case 'complete':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'partial':
        return <AlertCircle className="h-4 w-4 text-yellow-600" />;
      case 'incomplete':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      case 'empty':
      default:
        return <Package className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const handleZoneClick = (zone: ZoneData) => {
    setSelectedZone(zone);
    setZoneDialogOpen(true);
  };

  if (zones.length === 0) {
    return null;
  }

  return (
    <>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Map className="h-4 w-4" />
                  Mapa do Armazém
                  <Badge variant="outline" className="ml-2">
                    {zones.length} zonas
                  </Badge>
                </CardTitle>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 space-y-4">
              {/* Legend */}
              <div className="flex flex-wrap gap-4 p-3 rounded-lg bg-muted/30 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-green-200 border border-green-400" />
                  <span>Completa ({stats.complete})</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-yellow-200 border border-yellow-400" />
                  <span>Parcial ({stats.partial})</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-red-200 border border-red-400" />
                  <span>Incompleta ({stats.incomplete})</span>
                </div>
              </div>

              {/* Zone Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                <TooltipProvider>
                  {zones.map(zone => (
                    <Tooltip key={zone.name}>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => handleZoneClick(zone)}
                          className={cn(
                            "relative p-3 rounded-lg border-2 transition-all text-left",
                            "hover:shadow-md hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary",
                            getZoneColor(zone.status)
                          )}
                        >
                          {/* Zone name */}
                          <div className="flex items-center gap-1 mb-2">
                            <MapPin className="h-3 w-3 flex-shrink-0" />
                            <span className="font-medium text-sm truncate">{zone.name}</span>
                          </div>

                          {/* Stats */}
                          <div className="space-y-1 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">Produtos:</span>
                              <span className="font-bold">{zone.totalProducts}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">Sets:</span>
                              <span className="font-bold">{zone.totalSets}</span>
                            </div>
                          </div>

                          {/* Progress bar */}
                          <div className="mt-2 h-1.5 bg-white/50 rounded-full overflow-hidden">
                            <div 
                              className={cn(
                                "h-full rounded-full transition-all",
                                zone.status === 'complete' && "bg-green-500",
                                zone.status === 'partial' && "bg-yellow-500",
                                zone.status === 'incomplete' && "bg-red-500",
                                zone.status === 'empty' && "bg-gray-400"
                              )}
                              style={{ width: `${zone.completionPercentage}%` }}
                            />
                          </div>

                          {/* Status indicator */}
                          <div className="absolute top-2 right-2">
                            {getStatusIcon(zone.status)}
                          </div>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[250px]">
                        <div className="space-y-1">
                          <p className="font-medium">{zone.name}</p>
                          <div className="text-xs space-y-0.5">
                            <p className="text-green-600">✓ {zone.completeProducts} completos</p>
                            <p className="text-red-600">✗ {zone.incompleteProducts} incompletos</p>
                            <p className="text-blue-600">📦 {zone.totalSets} sets totais</p>
                          </div>
                          <p className="text-xs text-muted-foreground pt-1">
                            Clique para ver detalhes
                          </p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </TooltipProvider>
              </div>

              {/* Summary stats */}
              <div className="grid grid-cols-4 gap-4 pt-2">
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <p className="text-xl font-bold">{zones.length}</p>
                  <p className="text-xs text-muted-foreground">Zonas</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-green-50">
                  <p className="text-xl font-bold text-green-600">{stats.complete}</p>
                  <p className="text-xs text-muted-foreground">Completas</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-yellow-50">
                  <p className="text-xl font-bold text-yellow-600">{stats.partial}</p>
                  <p className="text-xs text-muted-foreground">Parciais</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-red-50">
                  <p className="text-xl font-bold text-red-600">{stats.incomplete}</p>
                  <p className="text-xs text-muted-foreground">Incompletas</p>
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Zone Details Dialog */}
      <Dialog open={zoneDialogOpen} onOpenChange={setZoneDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              {selectedZone?.name}
              {selectedZone && (
                <Badge 
                  className={cn(
                    "ml-2",
                    selectedZone.status === 'complete' && "bg-green-100 text-green-800",
                    selectedZone.status === 'partial' && "bg-yellow-100 text-yellow-800",
                    selectedZone.status === 'incomplete' && "bg-red-100 text-red-800"
                  )}
                >
                  {selectedZone.status === 'complete' && '✓ Completa'}
                  {selectedZone.status === 'partial' && '⚠ Parcial'}
                  {selectedZone.status === 'incomplete' && '✗ Incompleta'}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedZone && (
            <div className="flex-1 overflow-auto space-y-4">
              {/* Zone stats */}
              <div className="grid grid-cols-4 gap-3">
                <div className="text-center p-2 rounded-lg bg-muted/50">
                  <p className="text-lg font-bold">{selectedZone.totalProducts}</p>
                  <p className="text-xs text-muted-foreground">Produtos</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-blue-50">
                  <p className="text-lg font-bold text-blue-600">{selectedZone.totalSets}</p>
                  <p className="text-xs text-muted-foreground">Sets</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-green-50">
                  <p className="text-lg font-bold text-green-600">{selectedZone.completeProducts}</p>
                  <p className="text-xs text-muted-foreground">Completos</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-red-50">
                  <p className="text-lg font-bold text-red-600">{selectedZone.incompleteProducts}</p>
                  <p className="text-xs text-muted-foreground">Incompletos</p>
                </div>
              </div>

              {/* Products table */}
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="py-2">Código</TableHead>
                      <TableHead className="py-2">Nome</TableHead>
                      <TableHead className="py-2">Categoria</TableHead>
                      <TableHead className="py-2 text-center">Sets</TableHead>
                      <TableHead className="py-2">Status</TableHead>
                      <TableHead className="py-2">Palete</TableHead>
                      {onProductClick && <TableHead className="py-2 w-20">Ações</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedZone.products.map(product => (
                      <TableRow 
                        key={product.id}
                        className={cn(
                          product.hasPartialProduct && "bg-yellow-50/50"
                        )}
                      >
                        <TableCell className="py-2 font-mono text-sm">{product.code}</TableCell>
                        <TableCell className="py-2">{product.name}</TableCell>
                        <TableCell className="py-2">
                          <Badge variant="outline" className="text-xs">{product.category}</Badge>
                        </TableCell>
                        <TableCell className="py-2 text-center font-bold">{product.completeSets}</TableCell>
                        <TableCell className="py-2">
                          {product.completeSets > 0 && !product.hasPartialProduct && (
                            <Badge className="bg-green-100 text-green-800">Completo</Badge>
                          )}
                          {product.completeSets > 0 && product.hasPartialProduct && (
                            <Badge className="bg-yellow-100 text-yellow-800">Pendente</Badge>
                          )}
                          {product.completeSets === 0 && product.status !== 'not_counted' && (
                            <Badge variant="destructive">Incompleto</Badge>
                          )}
                          {product.status === 'not_counted' && (
                            <Badge variant="secondary">Não contado</Badge>
                          )}
                        </TableCell>
                        <TableCell className="py-2">
                          {product.uniquePallets.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {product.uniquePallets.slice(0, 2).map((p, i) => (
                                <Badge key={i} variant="secondary" className="text-xs">
                                  <Box className="h-2.5 w-2.5 mr-1" />
                                  {p}
                                </Badge>
                              ))}
                              {product.uniquePallets.length > 2 && (
                                <Badge variant="secondary" className="text-xs">
                                  +{product.uniquePallets.length - 2}
                                </Badge>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        {onProductClick && (
                          <TableCell className="py-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => {
                                setZoneDialogOpen(false);
                                onProductClick(product.id);
                              }}
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              Ver
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
