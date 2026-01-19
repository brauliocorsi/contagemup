import { useEffect, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useProductChanges, ProductChange } from '@/hooks/useProductChanges';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { History, Pencil, User, Plus, Trash2 } from 'lucide-react';

interface ProductHistoryPopoverProps {
  productId: string;
  children: React.ReactNode;
}

const FIELD_LABELS: Record<string, string> = {
  code: 'Código',
  name: 'Nome',
  category: 'Categoria',
  total_colis: 'Nº Colis',
  description: 'Descrição',
  location: 'Localização',
  pallet_number: 'Palete'
};

const CHANGE_TYPE_LABELS: Record<string, string> = {
  created: 'Criado',
  updated: 'Alterado',
  deleted: 'Eliminado'
};

export function ProductHistoryPopover({ productId, children }: ProductHistoryPopoverProps) {
  const { changes, loading, fetchChangesForProduct } = useProductChanges();
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open && productId) {
      fetchChangesForProduct(productId);
    }
  }, [open, productId, fetchChangesForProduct]);

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

  // Show all recent changes (last 15)
  const recentChanges = changes.slice(0, 15);

  const getChangeIcon = (change: ProductChange) => {
    if (change.change_type === 'created') {
      return <Plus className="h-3 w-3 text-green-600" />;
    }
    if (change.change_type === 'deleted') {
      return <Trash2 className="h-3 w-3 text-red-600" />;
    }
    return <Pencil className="h-3 w-3 text-blue-600" />;
  };

  const getChangeTypeBadge = (change: ProductChange) => {
    if (change.change_type === 'created') {
      return <Badge variant="default" className="bg-green-600 hover:bg-green-600 text-white text-[10px] px-1 py-0">Criado</Badge>;
    }
    if (change.change_type === 'deleted') {
      return <Badge variant="destructive" className="text-[10px] px-1 py-0">Eliminado</Badge>;
    }
    return <Badge variant="secondary" className="text-[10px] px-1 py-0">{FIELD_LABELS[change.field_changed || ''] || change.field_changed}</Badge>;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="p-3 border-b">
          <h4 className="font-medium text-sm flex items-center gap-2">
            <History className="h-4 w-4" />
            Histórico de Alterações
          </h4>
        </div>
        <ScrollArea className="h-[280px]">
          {loading ? (
            <div className="p-3 space-y-2">
              {[1, 2, 3, 4].map(i => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : recentChanges.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Sem alterações registadas</p>
            </div>
          ) : (
            <div className="p-2 space-y-2">
              {recentChanges.map((change) => (
                <div
                  key={change.id}
                  className="border rounded p-2 text-xs space-y-1.5 bg-muted/30"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getChangeIcon(change)}
                      {getChangeTypeBadge(change)}
                    </div>
                    <span className="text-muted-foreground text-[10px]">
                      {format(new Date(change.changed_at), "dd/MM/yy HH:mm", { locale: pt })}
                    </span>
                  </div>
                  
                  {change.change_type === 'updated' && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="line-through text-muted-foreground">{change.old_value || '(vazio)'}</span>
                      <span>→</span>
                      <span className="font-medium">{change.new_value || '(vazio)'}</span>
                    </div>
                  )}
                  
                  {change.change_type === 'created' && change.new_value && (
                    <div className="text-muted-foreground">
                      Valor: <span className="font-medium text-foreground">{change.new_value}</span>
                    </div>
                  )}
                  
                  {change.changed_by && userNames[change.changed_by] && (
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <User className="h-2.5 w-2.5" />
                      <span>{userNames[change.changed_by]}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
