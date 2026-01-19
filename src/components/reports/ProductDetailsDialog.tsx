import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { useProductChanges } from '@/hooks/useProductChanges';
import { supabase } from '@/integrations/supabase/client';
import { 
  Package, MapPin, Box, Tags, Layers, 
  CheckCircle2, AlertCircle, Clock, PlusCircle, 
  Pencil, Trash2, User
} from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';

interface ProductWithCounts {
  id: string;
  code: string;
  name: string;
  category: string;
  location: string | null;
  palletNumber: string | null;
  total_colis: number;
  completeSets: number;
  hasPartialProduct: boolean;
  status: string;
}

interface ProductDetailsDialogProps {
  product: ProductWithCounts | null;
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
};

export function ProductDetailsDialog({ product, open, onOpenChange }: ProductDetailsDialogProps) {
  const { changes, loading, fetchChangesForProduct } = useProductChanges();
  const [userNames, setUserNames] = useState<Record<string, string>>({});

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

  const getStatusBadge = () => {
    if (!product) return null;
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

  const lastChange = changes.length > 0 ? changes[0] : null;

  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Detalhes do Produto
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] pr-4">
          <div className="space-y-4">
            {/* Product Info Header */}
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold">{product.name}</h3>
                <p className="text-sm text-muted-foreground font-mono">{product.code}</p>
              </div>
              {getStatusBadge()}
            </div>

            <Separator />

            {/* Basic Information */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm font-medium">Informações</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <Tags className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Categoria</p>
                      <Badge variant="outline">{product.category}</Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Total Colis</p>
                      <p className="font-medium">{product.total_colis}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Localização</p>
                      <p className="font-medium">{product.location || '-'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Box className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Nº Palete</p>
                      <p className="font-medium">{product.palletNumber || '-'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <div>
                      <p className="text-xs text-muted-foreground">Sets Completos</p>
                      <p className="font-bold text-lg">{product.completeSets}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {product.hasPartialProduct ? (
                      <AlertCircle className="h-4 w-4 text-yellow-600" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    )}
                    <div>
                      <p className="text-xs text-muted-foreground">Status</p>
                      {getStatusBadge()}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Last Modification */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Última Modificação
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {loading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                ) : lastChange ? (
                  <div className="flex items-start gap-3">
                    {getChangeIcon(lastChange.change_type)}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {getChangeTypeBadge(lastChange.change_type)}
                        {lastChange.field_changed && (
                          <span className="text-sm text-muted-foreground">
                            Campo: <strong>{formatFieldName(lastChange.field_changed)}</strong>
                          </span>
                        )}
                      </div>
                      {lastChange.change_type === 'updated' && (
                        <p className="text-sm">
                          <span className="text-red-600 line-through">{lastChange.old_value || '(vazio)'}</span>
                          {' → '}
                          <span className="text-green-600">{lastChange.new_value || '(vazio)'}</span>
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <span>
                          {format(new Date(lastChange.changed_at), "dd MMM yyyy 'às' HH:mm", { locale: pt })}
                        </span>
                        {lastChange.changed_by && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {userNames[lastChange.changed_by] || 'Utilizador'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Sem histórico de alterações</p>
                )}
              </CardContent>
            </Card>

            {/* Full History */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm font-medium">Histórico Completo</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {loading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="flex gap-3">
                        <Skeleton className="h-8 w-8 rounded-full" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-48" />
                          <Skeleton className="h-3 w-32" />
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
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
