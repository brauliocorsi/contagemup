import { useMemo, useState } from 'react';
import { Undo2, MapPin } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useProducts } from '@/hooks/useProducts';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { pt } from 'date-fns/locale';
import type { Product } from '@/types/stock';

export interface MovementRow {
  id: string;
  product_id: string;
  movement_type: string;
  quantity: number;
  reason: string | null;
  reference: string | null;
  created_at: string;
  origem: string;
  reversed_at: string | null;
  reverses_movement_id: string | null;
}

export interface MovementLine {
  id: string;
  movement_id: string;
  colis_number: number;
  quantity: number;
  location: string | null;
  pallet_number: string | null;
}

export function formatLine(l: MovementLine) {
  const place = [l.location, l.pallet_number].filter(Boolean).join('/');
  return `C${l.colis_number}: ${l.quantity} un.${place ? ` @ ${place}` : ' (sem local)'}`;
}

export function useMovements(type: 'entrada' | 'saida', limit = 15) {
  return useQuery({
    queryKey: ['recent-movements', type, limit],
    queryFn: async (): Promise<{ rows: MovementRow[]; lines: Map<string, MovementLine[]> }> => {
      const { data, error } = await supabase
        .from('stock_movements_unified')
        .select('id, product_id, movement_type, quantity, reason, reference, created_at, origem, reversed_at, reverses_movement_id')
        .eq('movement_type', type)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      const rows = (data || []) as MovementRow[];

      const ids = rows.map(r => r.id);
      const lines = new Map<string, MovementLine[]>();
      if (ids.length > 0) {
        const { data: lineData } = await supabase
          .from('stock_movement_lines')
          .select('id, movement_id, colis_number, quantity, location, pallet_number')
          .in('movement_id', ids);
        (lineData || []).forEach(l => {
          const arr = lines.get(l.movement_id) || [];
          arr.push(l as MovementLine);
          lines.set(l.movement_id, arr);
        });
      }
      return { rows, lines };
    },
    refetchInterval: 30_000,
  });
}

interface Props {
  type: 'entrada' | 'saida';
  title?: string;
}

export function RecentMovementsPanel({ type, title }: Props) {
  const queryClient = useQueryClient();
  const { products } = useProducts();
  const [pending, setPending] = useState<MovementRow | null>(null);
  const [working, setWorking] = useState(false);

  const productMap = useMemo(() => {
    const m = new Map<string, Product>();
    products.forEach(p => m.set(p.id, p));
    return m;
  }, [products]);

  const { data, isLoading } = useMovements(type);
  const rows = data?.rows ?? [];
  const lines = data?.lines ?? new Map<string, MovementLine[]>();

  const doReverse = async () => {
    if (!pending) return;
    setWorking(true);
    try {
      const { error } = await supabase.rpc('reverse_stock_movement', { p_movement_id: pending.id });
      if (error) throw error;
      toast.success('Movimento anulado e stock reposto');
      queryClient.invalidateQueries({ queryKey: ['recent-movements'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['counts'] });
      queryClient.invalidateQueries({ queryKey: ['unlocated-counts'] });
      setPending(null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível anular');
    } finally {
      setWorking(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {title ?? (type === 'entrada' ? 'Entradas recentes' : 'Saídas recentes')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">A carregar…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem movimentos ainda.</p>
          ) : (
            <ScrollArea className="max-h-[420px]">
              <ul className="space-y-3 pr-3">
                {rows.map(r => {
                  const p = productMap.get(r.product_id);
                  const rowLines = lines.get(r.id) ?? [];
                  const canReverse =
                    r.origem === 'atual' && !r.reversed_at && !r.reverses_movement_id && rowLines.length > 0;
                  return (
                    <li key={r.id} className={cn('text-sm border-b last:border-0 pb-3', r.reversed_at && 'opacity-60')}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium truncate">{p?.name ?? 'Produto desconhecido'}</span>
                        <Badge variant="secondary" className="text-xs shrink-0">
                          {type === 'entrada' ? '+' : '−'}{r.quantity}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="font-mono">{p?.code ?? r.product_id.slice(0, 8)}</span>
                        <div className="flex items-center gap-2">
                          {r.reversed_at && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 border-destructive text-destructive">
                              anulado
                            </Badge>
                          )}
                          {r.reverses_movement_id && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0">reversão</Badge>
                          )}
                          <Badge variant="outline" className={cn('text-[10px] px-1 py-0', r.origem === 'arquivo' && 'bg-muted')}>
                            {r.origem}
                          </Badge>
                          <span>{formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: pt })}</span>
                        </div>
                      </div>
                      {rowLines.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {rowLines
                            .sort((a, b) => a.colis_number - b.colis_number)
                            .map(l => (
                              <Badge
                                key={l.id}
                                variant="outline"
                                className={cn('text-[10px] px-1.5 py-0 gap-1', !l.location && 'border-amber-400 text-amber-700')}
                              >
                                <MapPin className="h-2.5 w-2.5" />
                                {formatLine(l)}
                              </Badge>
                            ))}
                        </div>
                      )}
                      {r.reason && (
                        <p className="mt-1 text-xs text-muted-foreground">Motivo: {r.reason}</p>
                      )}
                      {canReverse && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-1 h-7 px-2 text-xs gap-1"
                          onClick={() => setPending(r)}
                        >
                          <Undo2 className="h-3 w-3" /> Anular
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Anular este movimento?</AlertDialogTitle>
            <AlertDialogDescription>
              {pending && type === 'entrada'
                ? 'As unidades serão retiradas das localizações onde entraram.'
                : 'As unidades serão devolvidas às localizações de onde saíram.'}
              {' '}O movimento original mantém-se no histórico marcado como anulado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={working}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); doReverse(); }} disabled={working}>
              {working ? 'A anular…' : 'Anular movimento'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
