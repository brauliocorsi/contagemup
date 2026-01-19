import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MapPin, ChevronDown, ChevronUp, CheckCircle2, AlertCircle, Package } from 'lucide-react';

interface LocationProduct {
  id: string;
  code: string;
  name: string;
  category: string;
  completeSets: number;
  hasPartialProduct: boolean;
  status: string;
}

interface LocationStat {
  location: string;
  products: LocationProduct[];
  total: number;
  complete: number;
  incomplete: number;
  totalSets: number;
  isComplete: boolean;
}

interface LocationStatsCardProps {
  locationStats: LocationStat[];
  onProductClick?: (productId: string) => void;
}

export function LocationStatsCard({ locationStats, onProductClick }: LocationStatsCardProps) {
  const [expandedLocations, setExpandedLocations] = useState<Set<string>>(new Set());

  const toggleLocation = (location: string) => {
    setExpandedLocations(prev => {
      const next = new Set(prev);
      if (next.has(location)) {
        next.delete(location);
      } else {
        next.add(location);
      }
      return next;
    });
  };

  const getStatusBadge = (stat: LocationStat) => {
    if (stat.total === 0) {
      return <Badge variant="secondary">Vazio</Badge>;
    }
    if (stat.isComplete) {
      return <Badge className="bg-green-100 text-green-800">✅ Completa</Badge>;
    }
    if (stat.incomplete > 0) {
      return <Badge className="bg-yellow-100 text-yellow-800">⚠️ {stat.incomplete} incompletos</Badge>;
    }
    return <Badge variant="secondary">Pendente</Badge>;
  };

  const getProductStatusBadge = (product: LocationProduct) => {
    if (product.completeSets > 0 && !product.hasPartialProduct) {
      return <Badge className="bg-green-100 text-green-800">Completo</Badge>;
    }
    if (product.completeSets > 0 && product.hasPartialProduct) {
      return <Badge className="bg-yellow-100 text-yellow-800">Completo + pendente</Badge>;
    }
    if (product.completeSets === 0 && product.status !== 'not_counted') {
      return <Badge variant="destructive">Incompleto</Badge>;
    }
    return <Badge variant="secondary">Não contado</Badge>;
  };

  if (locationStats.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {locationStats.map(stat => (
        <Collapsible
          key={stat.location}
          open={expandedLocations.has(stat.location)}
          onOpenChange={() => toggleLocation(stat.location)}
        >
          <Card className="overflow-hidden">
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-primary/10 text-primary">
                      <MapPin className="h-4 w-4" />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-medium">
                        {stat.location}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {stat.total} produtos • {stat.totalSets} sets completos
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {getStatusBadge(stat)}
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="text-green-600 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        {stat.complete}
                      </span>
                      <span className="text-red-600 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {stat.incomplete}
                      </span>
                    </div>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      {expandedLocations.has(stat.location) ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0 pb-3">
                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="py-2 text-xs">Código</TableHead>
                        <TableHead className="py-2 text-xs">Nome</TableHead>
                        <TableHead className="py-2 text-xs">Categoria</TableHead>
                        <TableHead className="py-2 text-xs text-center">Sets</TableHead>
                        <TableHead className="py-2 text-xs">Status</TableHead>
                        {onProductClick && <TableHead className="py-2 text-xs w-20">Ações</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stat.products.map(product => (
                        <TableRow 
                          key={product.id} 
                          className={product.hasPartialProduct ? 'bg-red-50/50' : ''}
                        >
                          <TableCell className="py-2 font-mono text-xs">{product.code}</TableCell>
                          <TableCell className="py-2 text-sm">{product.name}</TableCell>
                          <TableCell className="py-2">
                            <Badge variant="outline" className="text-xs">{product.category}</Badge>
                          </TableCell>
                          <TableCell className="py-2 text-center font-bold">{product.completeSets}</TableCell>
                          <TableCell className="py-2">{getProductStatusBadge(product)}</TableCell>
                          {onProductClick && (
                            <TableCell className="py-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onProductClick(product.id);
                                }}
                              >
                                <Package className="h-3 w-3 mr-1" />
                                Ver
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      ))}
    </div>
  );
}
