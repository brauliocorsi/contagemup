import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useProductChanges } from '@/hooks/useProductChanges';
import { useCategories } from '@/hooks/useCategories';
import { supabase } from '@/integrations/supabase/client';
import { classifyLocation, LocationInfo } from '@/lib/locationUtils';
import { 
  Package, MapPin, Box, Tags, Layers, 
  CheckCircle2, AlertCircle, Clock, PlusCircle, 
  Pencil, Trash2, User, Info, ArrowUpDown, Warehouse
} from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { Product } from '@/types/stock';

interface ColisLocationInfo {
  colisNumber: number;
  quantity: number;
  location: string | null;
  palletNumber: string | null;
}

interface LastCountInfo {
  productId: string;
  sessionId: string;
  sessionName: string;
  totalQuantity: number;
  countedAt: string;
  colisLocations: ColisLocationInfo[];
  uniqueLocations: string[];
  uniquePallets: string[];
}

interface ProductColisDetailsDialogProps {
  product: Product | null;
  lastCount: LastCountInfo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FIELD_LABELS: Record<string, string> = {
  code: 'Código',
  name: 'Nome',
  category: 'Categoria',
  description: 'Descrição',
  total_colis: 'Total Colis',
  location: 'Localização',
  pallet_number: 'Nº Palete',
  current_stock: 'Stock Atual',
  min_stock: 'Stock Mínimo',
};

function LocationTypeBadge({ location }: { location: string | null }) {
  const info = classifyLocation(location);
  
  return (
    <Badge variant="outline" className={`text-xs ${info.color}`}>
      {info.icon === 'rack' && <Warehouse className="h-2.5 w-2.5 mr-1" />}
      {info.shortLabel}
    </Badge>
  );
}

export function ProductColisDetailsDialog({ product, lastCount, open, onOpenChange }: ProductColisDetailsDialogProps) {
  const { changes, loading, fetchChangesForProduct } = useProductChanges();
  const { categories } = useCategories();
  const [userNames, setUserNames] = useState<Record<string, string>>({});

  const categoryColisNames = categories.find(c => c.name === product?.category)?.colis_names as Record<string, string> | null;

  useEffect(() => {
    if (open && product?.id) {
      fetchChangesForProduct(product.id);
    }
  }, [open, product?.id, fetchChangesForProduct]);

  useEffect(() => {
    const fetchUserNames = async () => {
      const userIds = [...new Set(changes.map(c => c.changed_by).filter(Boolean))];
      if (userIds.length === 0) return;

      const { data } = await supabase
        .from('profiles')
        .select('user_id, name')
        .in('user_id', userIds);

      if (data) {
        const names: Record<string, string> = {};
        data.forEach(profile => {
          names[profile.user_id] = profile.name;
        });
        setUserNames(names);
      }
    };

    if (changes.length > 0) {
      fetchUserNames();
    }
  }, [changes]);

  const getChangeIcon = (changeType: string) => {
    switch (changeType) {
      case 'created':
        return <PlusCircle className="h-4 w-4 text-green-600" />;
      case 'updated':
        return <Pencil className="h-4 w-4 text-blue-600" />;
      case 'deleted':
        return <Trash2 className="h-4 w-4 text-red-600" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getChangeTypeBadge = (changeType: string) => {
    switch (changeType) {
      case 'created':
        return <Badge className="bg-green-100 text-green-800">Criado</Badge>;
      case 'updated':
        return <Badge className="bg-blue-100 text-blue-800">Atualizado</Badge>;
      case 'deleted':
        return <Badge variant="destructive">Eliminado</Badge>;
      default:
        return <Badge variant="secondary">{changeType}</Badge>;
    }
  };

  const formatFieldName = (field: string | null): string => {
    if (!field) return '-';
    return FIELD_LABELS[field] || field;
  };

  const getColisName = (colisNumber: number): string | null => {
    return categoryColisNames?.[colisNumber.toString()] || null;
  };

  if (!product) return null;

  // Group colis by location for summary
  const colisByLocation: Record<string, ColisLocationInfo[]> = {};
  const colisByPallet: Record<string, ColisLocationInfo[]> = {};
  
  lastCount?.colisLocations.forEach(c => {
    const loc = c.location || 'Sem localização';
    const pallet = c.palletNumber || 'Sem palete';
    
    if (!colisByLocation[loc]) colisByLocation[loc] = [];
    colisByLocation[loc].push(c);
    
    if (!colisByPallet[pallet]) colisByPallet[pallet] = [];
    colisByPallet[pallet].push(c);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Detalhes do Produto
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[75vh] pr-4">
          <div className="space-y-4">
            {/* Product Info Header */}
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold">{product.name}</h3>
                <p className="text-sm text-muted-foreground font-mono">{product.code}</p>
              </div>
              <Badge variant="outline">{product.category}</Badge>
            </div>

            <Separator />

            {/* Basic Information Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card>
                <CardContent className="p-3 flex items-center gap-2">
                  <Layers className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Total Colis</p>
                    <p className="font-bold text-lg">{product.total_colis}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Stock Atual</p>
                    <p className="font-bold text-lg">{product.current_stock} un.</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Localização Base</p>
                    <p className="font-medium text-sm truncate">{product.location || '-'}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 flex items-center gap-2">
                  <Box className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Palete Base</p>
                    <p className="font-medium text-sm truncate">{product.pallet_number || '-'}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Colis Details Tabs */}
            <Tabs defaultValue="colis" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="colis" className="text-xs">
                  <Layers className="h-3 w-3 mr-1" />
                  Colis ({product.total_colis})
                </TabsTrigger>
                <TabsTrigger value="locations" className="text-xs">
                  <MapPin className="h-3 w-3 mr-1" />
                  Localizações ({Object.keys(colisByLocation).length})
                </TabsTrigger>
                <TabsTrigger value="history" className="text-xs">
                  <Clock className="h-3 w-3 mr-1" />
                  Histórico ({changes.length})
                </TabsTrigger>
              </TabsList>

              {/* Colis Tab */}
              <TabsContent value="colis" className="mt-4">
                {lastCount && lastCount.colisLocations.length > 0 ? (
                  <Card>
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm font-medium flex items-center justify-between">
                        <span>Detalhes de cada Coli</span>
                        <Badge variant="outline" className="text-xs">
                          Última contagem: {format(new Date(lastCount.countedAt), "dd/MM/yy HH:mm", { locale: pt })}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-16">Coli</TableHead>
                            <TableHead>Nome</TableHead>
                            <TableHead>Localização</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Palete</TableHead>
                            <TableHead className="text-right">Qtd</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {Array.from({ length: product.total_colis }, (_, i) => i + 1).map(colisNum => {
                            const colisData = lastCount.colisLocations.find(c => c.colisNumber === colisNum);
                            const colisName = getColisName(colisNum);
                            
                            return (
                              <TableRow key={colisNum}>
                                <TableCell className="font-mono font-medium">
                                  C{colisNum}
                                </TableCell>
                                <TableCell>
                                  {colisName ? (
                                    <span className="text-sm">{colisName}</span>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">-</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {colisData?.location ? (
                                    <span className="flex items-center gap-1 text-sm">
                                      <MapPin className="h-3 w-3 text-muted-foreground" />
                                      {colisData.location}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">-</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <LocationTypeBadge location={colisData?.location || null} />
                                </TableCell>
                                <TableCell>
                                  {colisData?.palletNumber ? (
                                    <span className="flex items-center gap-1 text-sm">
                                      <Box className="h-3 w-3 text-muted-foreground" />
                                      {colisData.palletNumber}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">-</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  {colisData ? (
                                    <Badge variant={colisData.quantity > 0 ? 'default' : 'secondary'}>
                                      {colisData.quantity}
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-muted-foreground">
                                      0
                                    </Badge>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="py-8 text-center text-muted-foreground">
                      <Info className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>Este produto ainda não foi contado</p>
                      <p className="text-xs mt-1">As informações de localização por coli aparecerão após uma contagem</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Locations Summary Tab */}
              <TabsContent value="locations" className="mt-4">
                <div className="space-y-4">
                  {/* By Location */}
                  <Card>
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        Por Localização
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      {Object.keys(colisByLocation).length > 0 ? (
                        <div className="space-y-2">
                          {Object.entries(colisByLocation).map(([loc, colis]) => {
                            const locInfo = classifyLocation(loc === 'Sem localização' ? null : loc);
                            return (
                              <div key={loc} className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className={locInfo.color}>
                                    {locInfo.shortLabel}
                                  </Badge>
                                  <span className="text-sm font-medium">{loc}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">
                                    Colis: {colis.map(c => `C${c.colisNumber}`).join(', ')}
                                  </span>
                                  <Badge variant="secondary">{colis.length}</Badge>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Sem dados de localização
                        </p>
                      )}
                    </CardContent>
                  </Card>

                  {/* By Pallet */}
                  <Card>
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Box className="h-4 w-4" />
                        Por Palete
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      {Object.keys(colisByPallet).length > 0 ? (
                        <div className="space-y-2">
                          {Object.entries(colisByPallet).map(([pallet, colis]) => (
                            <div key={pallet} className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                              <div className="flex items-center gap-2">
                                <Box className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-medium">{pallet}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">
                                  Colis: {colis.map(c => `C${c.colisNumber}`).join(', ')}
                                </span>
                                <Badge variant="secondary">{colis.length}</Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Sem dados de palete
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* History Tab */}
              <TabsContent value="history" className="mt-4">
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm font-medium">Histórico de Alterações</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {loading ? (
                      <div className="space-y-3">
                        {[1, 2, 3].map(i => (
                          <div key={i} className="animate-pulse flex gap-3">
                            <div className="h-8 w-8 bg-muted rounded-full" />
                            <div className="flex-1 space-y-2">
                              <div className="h-4 w-48 bg-muted rounded" />
                              <div className="h-3 w-32 bg-muted rounded" />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : changes.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Nenhuma alteração registrada
                      </p>
                    ) : (
                      <div className="space-y-3 max-h-64 overflow-y-auto">
                        {changes.map((change) => (
                          <div 
                            key={change.id} 
                            className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors"
                          >
                            <div className="mt-0.5">{getChangeIcon(change.change_type)}</div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                {getChangeTypeBadge(change.change_type)}
                                {change.field_changed && (
                                  <span className="text-xs text-muted-foreground">
                                    {formatFieldName(change.field_changed)}
                                  </span>
                                )}
                              </div>
                              {change.change_type === 'updated' && (
                                <p className="text-sm mt-1 truncate">
                                  <span className="text-red-600">{change.old_value || '(vazio)'}</span>
                                  {' → '}
                                  <span className="text-green-600">{change.new_value || '(vazio)'}</span>
                                </p>
                              )}
                              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                                <span>
                                  {format(new Date(change.changed_at), "dd/MM/yy HH:mm", { locale: pt })}
                                </span>
                                {change.changed_by && userNames[change.changed_by] && (
                                  <span className="flex items-center gap-1">
                                    <User className="h-3 w-3" />
                                    {userNames[change.changed_by]}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
