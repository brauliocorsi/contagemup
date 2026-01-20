import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { MapPin, Box, ChevronDown, ChevronUp, AlertCircle, Search, Package, FileDown } from 'lucide-react';
import { ProductWithCounts, ColisDetail } from '@/types/stock';
import { cn } from '@/lib/utils';

interface ColisDispersionCardProps {
  productsWithCounts: ProductWithCounts[];
  categoryColisNamesMap: Record<string, Record<string, string> | null>;
  onProductClick?: (productId: string) => void;
}

interface DispersedProduct {
  id: string;
  code: string;
  name: string;
  category: string;
  totalColis: number;
  colisDetails: {
    colisNumber: number;
    colisName: string | null;
    quantity: number;
    location: string | null;
    palletNumber: string | null;
  }[];
  uniqueLocations: string[];
  uniquePallets: string[];
}

export function ColisDispersionCard({ 
  productsWithCounts, 
  categoryColisNamesMap,
  onProductClick 
}: ColisDispersionCardProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [isOpen, setIsOpen] = useState(true);

  // Get products with multiple locations or pallets (dispersed colis)
  const dispersedProducts = useMemo(() => {
    return productsWithCounts
      .filter(p => p.hasMultipleLocations || p.hasMultiplePallets || p.uniqueLocations.length > 0)
      .map(p => {
        const colisNames = categoryColisNamesMap[p.category];
        return {
          id: p.id,
          code: p.code,
          name: p.name,
          category: p.category,
          totalColis: p.total_colis,
          colisDetails: p.colisDetails.map(c => ({
            colisNumber: c.colis_number,
            colisName: colisNames?.[c.colis_number.toString()] || null,
            quantity: c.quantity,
            location: c.location,
            palletNumber: c.pallet_number
          })),
          uniqueLocations: p.uniqueLocations,
          uniquePallets: p.uniquePallets,
          hasMultipleLocations: p.hasMultipleLocations,
          hasMultiplePallets: p.hasMultiplePallets
        };
      })
      .sort((a, b) => {
        // Sort by dispersed first (multiple locations/pallets)
        const aDispersed = a.uniqueLocations.length > 1 || a.uniquePallets.length > 1;
        const bDispersed = b.uniqueLocations.length > 1 || b.uniquePallets.length > 1;
        if (aDispersed && !bDispersed) return -1;
        if (!aDispersed && bDispersed) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [productsWithCounts, categoryColisNamesMap]);

  const filteredProducts = useMemo(() => {
    if (!searchTerm) return dispersedProducts;
    const term = searchTerm.toLowerCase();
    return dispersedProducts.filter(p =>
      p.code.toLowerCase().includes(term) ||
      p.name.toLowerCase().includes(term) ||
      p.uniqueLocations.some(l => l.toLowerCase().includes(term)) ||
      p.uniquePallets.some(pal => pal.toLowerCase().includes(term))
    );
  }, [dispersedProducts, searchTerm]);

  const toggleProduct = (productId: string) => {
    setExpandedProducts(prev => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedProducts(new Set(filteredProducts.map(p => p.id)));
  };

  const collapseAll = () => {
    setExpandedProducts(new Set());
  };

  // Stats
  const stats = useMemo(() => {
    const dispersed = dispersedProducts.filter(p => 
      p.uniqueLocations.length > 1 || p.uniquePallets.length > 1
    ).length;
    const totalWithLocation = dispersedProducts.filter(p => p.uniqueLocations.length > 0).length;
    return { dispersed, totalWithLocation, total: dispersedProducts.length };
  }, [dispersedProducts]);

  // Export dispersed colis to CSV
  const exportToCSV = () => {
    if (filteredProducts.length === 0) return;

    const headers = ['Código', 'Nome', 'Categoria', 'Coli', 'Nome Coli', 'Quantidade', 'Localização', 'Palete'];
    const rows: string[][] = [];

    filteredProducts.forEach(product => {
      product.colisDetails.forEach(coli => {
        rows.push([
          product.code,
          product.name,
          product.category,
          `${coli.colisNumber}/${product.totalColis}`,
          coli.colisName || '-',
          coli.quantity.toString(),
          coli.location || '-',
          coli.palletNumber || '-'
        ]);
      });
    });

    const csv = [headers, ...rows].map(row => row.join(';')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dispersao_colis_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (dispersedProducts.length === 0) {
    return null;
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Dispersão de Colis por Localização
                {stats.dispersed > 0 && (
                  <Badge variant="destructive" className="ml-2">
                    {stats.dispersed} disperso{stats.dispersed > 1 ? 's' : ''}
                  </Badge>
                )}
              </CardTitle>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {/* Stats summary */}
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold">{stats.totalWithLocation}</p>
                <p className="text-xs text-muted-foreground">Com localização</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-orange-50">
                <p className="text-2xl font-bold text-orange-600">{stats.dispersed}</p>
                <p className="text-xs text-muted-foreground">Colis dispersos</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-green-50">
                <p className="text-2xl font-bold text-green-600">{stats.total - stats.dispersed}</p>
                <p className="text-xs text-muted-foreground">Colis unificados</p>
              </div>
            </div>

            {/* Search and actions */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar por código, nome, localização..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={expandAll}>
                  Expandir todos
                </Button>
                <Button variant="outline" size="sm" onClick={collapseAll}>
                  Recolher todos
                </Button>
                <Button variant="outline" size="sm" onClick={exportToCSV}>
                  <FileDown className="h-4 w-4 mr-1" />
                  CSV
                </Button>
              </div>
            </div>

            {/* Product list */}
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {filteredProducts.map(product => {
                const isExpanded = expandedProducts.has(product.id);
                const isDispersed = product.uniqueLocations.length > 1 || product.uniquePallets.length > 1;

                return (
                  <Collapsible
                    key={product.id}
                    open={isExpanded}
                    onOpenChange={() => toggleProduct(product.id)}
                  >
                    <div className={cn(
                      "border rounded-lg overflow-hidden",
                      isDispersed && "border-orange-300 bg-orange-50/30"
                    )}>
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className={cn(
                              "p-1.5 rounded-full",
                              isDispersed ? "bg-orange-100 text-orange-600" : "bg-primary/10 text-primary"
                            )}>
                              {isDispersed ? (
                                <AlertCircle className="h-4 w-4" />
                              ) : (
                                <Package className="h-4 w-4" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{product.name}</p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span className="font-mono">{product.code}</span>
                                <Badge variant="outline" className="text-xs">{product.category}</Badge>
                                <span>{product.totalColis} colis</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {/* Location badges */}
                            <div className="hidden sm:flex flex-wrap gap-1 max-w-[200px]">
                              {product.uniqueLocations.slice(0, 3).map((loc, i) => (
                                <Badge 
                                  key={i} 
                                  variant="secondary" 
                                  className="text-xs flex items-center gap-1"
                                >
                                  <MapPin className="h-2.5 w-2.5" />
                                  {loc}
                                </Badge>
                              ))}
                              {product.uniqueLocations.length > 3 && (
                                <Badge variant="secondary" className="text-xs">
                                  +{product.uniqueLocations.length - 3}
                                </Badge>
                              )}
                            </div>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </Button>
                          </div>
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="border-t px-3 pb-3 pt-2">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/30">
                                <TableHead className="py-1.5 text-xs">Coli</TableHead>
                                <TableHead className="py-1.5 text-xs">Nome</TableHead>
                                <TableHead className="py-1.5 text-xs text-center">Qtd</TableHead>
                                <TableHead className="py-1.5 text-xs">
                                  <div className="flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    Localização
                                  </div>
                                </TableHead>
                                <TableHead className="py-1.5 text-xs">
                                  <div className="flex items-center gap-1">
                                    <Box className="h-3 w-3" />
                                    Palete
                                  </div>
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {product.colisDetails.map(coli => {
                                const primaryLocation = product.uniqueLocations[0];
                                const primaryPallet = product.uniquePallets[0];
                                const locDiff = coli.location && coli.location !== primaryLocation;
                                const palDiff = coli.palletNumber && coli.palletNumber !== primaryPallet;

                                return (
                                  <TableRow 
                                    key={coli.colisNumber}
                                    className={cn(
                                      (locDiff || palDiff) && "bg-orange-50"
                                    )}
                                  >
                                    <TableCell className="py-1.5 text-sm font-medium">
                                      {coli.colisNumber}/{product.totalColis}
                                    </TableCell>
                                    <TableCell className="py-1.5 text-sm text-muted-foreground">
                                      {coli.colisName || '-'}
                                    </TableCell>
                                    <TableCell className="py-1.5 text-sm text-center font-bold">
                                      {coli.quantity}
                                    </TableCell>
                                    <TableCell className="py-1.5">
                                      {coli.location ? (
                                        <Badge 
                                          variant={locDiff ? "default" : "secondary"} 
                                          className={cn(
                                            "text-xs",
                                            locDiff && "bg-orange-100 text-orange-800 hover:bg-orange-100"
                                          )}
                                        >
                                          {coli.location}
                                        </Badge>
                                      ) : (
                                        <span className="text-xs text-muted-foreground">-</span>
                                      )}
                                    </TableCell>
                                    <TableCell className="py-1.5">
                                      {coli.palletNumber ? (
                                        <Badge 
                                          variant={palDiff ? "default" : "secondary"}
                                          className={cn(
                                            "text-xs",
                                            palDiff && "bg-orange-100 text-orange-800 hover:bg-orange-100"
                                          )}
                                        >
                                          {coli.palletNumber}
                                        </Badge>
                                      ) : (
                                        <span className="text-xs text-muted-foreground">-</span>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                          {onProductClick && (
                            <div className="mt-2 flex justify-end">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onProductClick(product.id)}
                              >
                                <Package className="h-3 w-3 mr-1" />
                                Ver detalhes
                              </Button>
                            </div>
                          )}
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                );
              })}

              {filteredProducts.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Nenhum produto encontrado</p>
                </div>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
