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
import { History, Pencil, User } from 'lucide-react';

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

  // Only show recent code changes (last 5)
  const recentCodeChanges = changes
    .filter(c => c.field_changed === 'code')
    .slice(0, 5);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children}
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="p-3 border-b">
          <h4 className="font-medium text-sm flex items-center gap-2">
            <History className="h-4 w-4" />
            Histórico do Código
          </h4>
        </div>
        <ScrollArea className="h-[200px]">
          {loading ? (
            <div className="p-3 space-y-2">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : recentCodeChanges.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Sem alterações de código</p>
            </div>
          ) : (
            <div className="p-2 space-y-2">
              {recentCodeChanges.map((change) => (
                <div
                  key={change.id}
                  className="border rounded p-2 text-xs space-y-1 bg-muted/30"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <Pencil className="h-3 w-3 text-blue-600" />
                      <span className="text-muted-foreground">
                        {format(new Date(change.changed_at), "dd/MM/yy HH:mm", { locale: pt })}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="line-through text-muted-foreground">{change.old_value}</span>
                    <span>→</span>
                    <span className="font-medium">{change.new_value}</span>
                  </div>
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
