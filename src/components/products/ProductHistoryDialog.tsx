import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useProductChanges, ProductChange } from '@/hooks/useProductChanges';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { History, Plus, Pencil, Trash2, User } from 'lucide-react';

interface ProductHistoryDialogProps {
  productId: string;
  productName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FIELD_LABELS: Record<string, string> = {
  code: 'Código',
  name: 'Nome',
  category: 'Categoria',
  total_colis: 'Número de Colis',
  description: 'Descrição',
  location: 'Localização',
  pallet_number: 'Nº Palete'
};

export function ProductHistoryDialog({ productId, productName, open, onOpenChange }: ProductHistoryDialogProps) {
  const { changes, loading, fetchChangesForProduct } = useProductChanges();
  const [userNames, setUserNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open && productId) {
      fetchChangesForProduct(productId);
    }
  }, [open, productId, fetchChangesForProduct]);

  // Fetch user names for the changes
  useEffect(() => {
    const fetchUserNames = async () => {
      const userIds = [...new Set(changes.filter(c => c.changed_by).map(c => c.changed_by!))];
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
        return <Plus className="h-4 w-4 text-green-600" />;
      case 'updated':
        return <Pencil className="h-4 w-4 text-blue-600" />;
      case 'deleted':
        return <Trash2 className="h-4 w-4 text-red-600" />;
      default:
        return <History className="h-4 w-4" />;
    }
  };

  const getChangeTypeBadge = (changeType: string) => {
    switch (changeType) {
      case 'created':
        return <Badge className="bg-green-100 text-green-800">Criado</Badge>;
      case 'updated':
        return <Badge className="bg-blue-100 text-blue-800">Atualizado</Badge>;
      case 'deleted':
        return <Badge className="bg-red-100 text-red-800">Eliminado</Badge>;
      default:
        return <Badge variant="secondary">{changeType}</Badge>;
    }
  };

  const formatFieldName = (field: string | null) => {
    if (!field) return '-';
    return FIELD_LABELS[field] || field;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Histórico de Alterações
          </DialogTitle>
          <DialogDescription>
            Histórico de alterações do produto "{productName}"
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="h-[400px] pr-4">
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : changes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhuma alteração registada</p>
            </div>
          ) : (
            <div className="space-y-4">
              {changes.map((change) => (
                <div
                  key={change.id}
                  className="border rounded-lg p-4 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getChangeIcon(change.change_type)}
                      {getChangeTypeBadge(change.change_type)}
                      {change.field_changed && (
                        <span className="text-sm font-medium">
                          {formatFieldName(change.field_changed)}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(change.changed_at), "dd MMM yyyy 'às' HH:mm", { locale: pt })}
                    </span>
                  </div>
                  
                  {change.change_type === 'updated' && (
                    <div className="text-sm grid grid-cols-2 gap-2 bg-muted/50 rounded p-2">
                      <div>
                        <span className="text-muted-foreground">Antes: </span>
                        <span className="font-medium">{change.old_value || '-'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Depois: </span>
                        <span className="font-medium">{change.new_value || '-'}</span>
                      </div>
                    </div>
                  )}
                  
                  {change.changed_by && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <User className="h-3 w-3" />
                      {userNames[change.changed_by] || 'Utilizador desconhecido'}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}