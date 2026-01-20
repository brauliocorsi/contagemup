import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Map, ChevronDown, ChevronUp, Package, MapPin, CheckCircle2, AlertCircle, Box, Eye, Warehouse } from 'lucide-react';
import { ProductWithCounts, ColisDetail } from '@/types/stock';
import { cn } from '@/lib/utils';
import { classifyLocation } from '@/lib/locationUtils';

interface WarehouseMapProps {
  productsWithCounts: ProductWithCounts[];
  categoryColisNamesMap?: Record<string, Record<string, string> | null>;
  onProductClick?: (productId: string) => void;
}

interface ColisInZone {
  productId: string;
  productCode: string;
  productName: string;
  productCategory: string;
  colisNumber: number;
  colisName: string | null;
  totalColis: number;
  quantity: number;
  palletNumber: string | null;
}

interface ZoneData {
  name: string;
  products: ProductWithCounts[];
  colisInZone: ColisInZone[];
  totalProducts: number;
  totalColis: number;
  totalSets: number;
  completeProducts: number;
  incompleteProducts: number;
  status: 'complete' | 'partial' | 'incomplete' | 'empty';
  completionPercentage: number;
}

export function WarehouseMap({ productsWithCounts, categoryColisNamesMap, onProductClick }: WarehouseMapProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [selectedZone, setSelectedZone] = useState<ZoneData | null>(null);
  const [zoneDialogOpen, setZoneDialogOpen] = useState(false);

  // Group products and colis by location
  const zones = useMemo(() => {
    const locationMap: Record<string, { products: Set<ProductWithCounts>; colis: ColisInZone[] }> = {};

    productsWithCounts.forEach(product => {
      const colisNames = categoryColisNamesMap?.[product.category];
      
      // Process each coli's location
      product.colisDetails.forEach(coli => {
        const location = coli.location || product.location || 'Sem localização';
        
        if (!locationMap[location]) {
          locationMap[location] = { products: new Set(), colis: [] };
        }
        
        locationMap[location].products.add(product);
        locationMap[location].colis.push({
          productId: product.id,
          productCode: product.code,
          productName: product.name,
          productCategory: product.category,
          colisNumber: coli.colis_number,
          colisName: colisNames?.[coli.colis_number.toString()] || null,
          totalColis: product.total_colis,
          quantity: coli.quantity,
          palletNumber: coli.pallet_number
        });
      });

      // If product has no colis details, add to default location
      if (product.colisDetails.length === 0) {
        const location = product.location || 'Sem localização';
        if (!locationMap[location]) {
          locationMap[location] = { products: new Set(), colis: [] };
        }
        locationMap[location].products.add(product);
      }
    });

    const zonesArray: ZoneData[] = [];
    
    Object.entries(locationMap).forEach(([name, data]) => {
      const products = Array.from(data.products);
      const totalProducts = products.length;
      const totalColis = data.colis.length;
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
        colisInZone: data.colis.sort((a, b) => {
          const nameComp = a.productName.localeCompare(b.productName);
          if (nameComp !== 0) return nameComp;
          return a.colisNumber - b.colisNumber;
        }),
        totalProducts,
        totalColis,
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
  }, [productsWithCounts, categoryColisNamesMap]);

  // Stats
  const stats = useMemo(() => {
    const total = zones.length;
    const complete = zones.filter(z => z.status === 'complete').length;
    const incomplete = zones.filter(z => z.status === 'incomplete').length;
    const partial = zones.filter(z => z.status === 'partial').length;
    const totalColis = zones.reduce((sum, z) => sum + z.totalColis, 0);
    return { total, complete, incomplete, partial, totalColis };
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
                    {zones.length} zonas • {stats.totalColis} colis
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
                          {/* Zone name with location type */}
                          <div className="flex items-center gap-1 mb-2">
                            <MapPin className="h-3 w-3 flex-shrink-0" />
                            <span className="font-medium text-sm truncate">{zone.name}</span>
                          </div>
                          {/* Location type badge */}
                          {(() => {
                            const locInfo = classifyLocation(zone.name);
                            return (
                              <Badge variant="outline" className={`text-[10px] mb-1 ${locInfo.color}`}>
                                {locInfo.icon === 'rack' && <Warehouse className="h-2 w-2 mr-0.5" />}
                                {locInfo.label}
                              </Badge>
                            );
                          })()}

                          {/* Stats */}
                          <div className="space-y-1 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">Produtos:</span>
                              <span className="font-bold">{zone.totalProducts}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">Colis:</span>
                              <span className="font-bold">{zone.totalColis}</span>
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
                      <TooltipContent side="top" className="max-w-[280px]">
                        <div className="space-y-1">
                          <p className="font-medium">{zone.name}</p>
                          <div className="text-xs space-y-0.5">
                            <p>📦 {zone.totalProducts} produtos</p>
                            <p>🧩 {zone.totalColis} colis nesta zona</p>
                            <p className="text-green-600">✓ {zone.completeProducts} completos</p>
                            <p className="text-red-600">✗ {zone.incompleteProducts} incompletos</p>
                          </div>
                          <p className="text-xs text-muted-foreground pt-1">
                            Clique para ver colis
                          </p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </TooltipProvider>
              </div>

              {/* Summary stats */}
              <div className="grid grid-cols-5 gap-4 pt-2">
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <p className="text-xl font-bold">{zones.length}</p>
                  <p className="text-xs text-muted-foreground">Zonas</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-blue-50">
                  <p className="text-xl font-bold text-blue-600">{stats.totalColis}</p>
                  <p className="text-xs text-muted-foreground">Colis</p>
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

      {/* Zone Details Dialog - Now shows colis details */}
      <Dialog open={zoneDialogOpen} onOpenChange={setZoneDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              {selectedZone?.name}
              {selectedZone && (
                <>
                  <Badge 
                    variant="outline"
                    className={classifyLocation(selectedZone.name).color}
                  >
                    {classifyLocation(selectedZone.name).label}
                  </Badge>
                  <Badge 
                    className={cn(
                      "ml-1",
                      selectedZone.status === 'complete' && "bg-green-100 text-green-800",
                      selectedZone.status === 'partial' && "bg-yellow-100 text-yellow-800",
                      selectedZone.status === 'incomplete' && "bg-red-100 text-red-800"
                    )}
                  >
                    {selectedZone.status === 'complete' && '✓ Completa'}
                    {selectedZone.status === 'partial' && '⚠ Parcial'}
                    {selectedZone.status === 'incomplete' && '✗ Incompleta'}
                  </Badge>
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedZone && (
            <div className="flex-1 overflow-auto space-y-4">
              {/* Zone stats */}
              <div className="grid grid-cols-5 gap-3">
                <div className="text-center p-2 rounded-lg bg-muted/50">
                  <p className="text-lg font-bold">{selectedZone.totalProducts}</p>
                  <p className="text-xs text-muted-foreground">Produtos</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-blue-50">
                  <p className="text-lg font-bold text-blue-600">{selectedZone.totalColis}</p>
                  <p className="text-xs text-muted-foreground">Colis</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-primary/10">
                  <p className="text-lg font-bold text-primary">{selectedZone.totalSets}</p>
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

              {/* Colis table - detailed view */}
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted/50 px-3 py-2 border-b">
                  <h4 className="font-medium text-sm flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    Colis nesta localização ({selectedZone.colisInZone.length})
                  </h4>
                </div>
                <div className="max-h-[400px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="py-2 sticky top-0 bg-muted/30">Produto</TableHead>
                        <TableHead className="py-2 sticky top-0 bg-muted/30">Código</TableHead>
                        <TableHead className="py-2 sticky top-0 bg-muted/30">Coli</TableHead>
                        <TableHead className="py-2 sticky top-0 bg-muted/30">Parte</TableHead>
                        <TableHead className="py-2 text-center sticky top-0 bg-muted/30">Qtd</TableHead>
                        <TableHead className="py-2 sticky top-0 bg-muted/30">Palete</TableHead>
                        {onProductClick && <TableHead className="py-2 w-16 sticky top-0 bg-muted/30">Ver</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedZone.colisInZone.map((coli, idx) => (
                        <TableRow key={`${coli.productId}-${coli.colisNumber}`}>
                          <TableCell className="py-1.5 text-sm font-medium max-w-[200px] truncate">
                            {coli.productName}
                          </TableCell>
                          <TableCell className="py-1.5 font-mono text-xs text-muted-foreground">
                            {coli.productCode}
                          </TableCell>
                          <TableCell className="py-1.5">
                            <Badge variant="outline" className="text-xs">
                              {coli.colisNumber}/{coli.totalColis}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-1.5 text-sm text-muted-foreground">
                            {coli.colisName || '-'}
                          </TableCell>
                          <TableCell className="py-1.5 text-center">
                            <Badge 
                              variant={coli.quantity > 0 ? "default" : "secondary"}
                              className={cn(
                                "text-xs",
                                coli.quantity > 0 && "bg-green-100 text-green-800"
                              )}
                            >
                              {coli.quantity}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-1.5">
                            {coli.palletNumber ? (
                              <Badge variant="secondary" className="text-xs">
                                <Box className="h-2.5 w-2.5 mr-1" />
                                {coli.palletNumber}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          {onProductClick && (
                            <TableCell className="py-1.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() => {
                                  setZoneDialogOpen(false);
                                  onProductClick(coli.productId);
                                }}
                              >
                                <Eye className="h-3 w-3" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                      {selectedZone.colisInZone.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                            Nenhum coli registado nesta localização
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
