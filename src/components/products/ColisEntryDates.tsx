import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { CalendarDays, Loader2, Package } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';

interface EntryRow {
  key: string;
  colis: number;
  date: string;
  quantity: number;
  location: string | null;
  origin: string;
  reference: string | null;
}

/** Datas reais de entrada, coli a coli: entradas registadas + acertos de contagem positivos. */
export function useColisEntryDates(productId: string | null) {
  return useQuery({
    queryKey: ['colis-entry-dates', productId],
    enabled: !!productId,
    staleTime: 30_000,
    queryFn: async (): Promise<EntryRow[]> => {
      if (!productId) return [];
      const [lines, logs] = await Promise.all([
        supabase
          .from('stock_movement_lines')
          .select('id, colis_number, quantity, location, created_at, stock_movements!inner(movement_type, reason, reference, reversed_at)')
          .eq('product_id', productId)
          .eq('stock_movements.movement_type', 'entrada')
          .order('created_at', { ascending: false })
          .limit(1000),
        supabase
          .from('count_logs')
          .select('id, colis_number, quantity_before, quantity_after, created_at')
          .eq('product_id', productId)
          .order('created_at', { ascending: false })
          .limit(1000),
      ]);
      if (lines.error) throw lines.error;
      if (logs.error) throw logs.error;
      const out: EntryRow[] = [];
      (lines.data || []).forEach((l: any) => {
        if (l.stock_movements?.reversed_at) return;
        out.push({
          key: `m-${l.id}`, colis: l.colis_number, date: l.created_at, quantity: l.quantity,
          location: l.location, origin: l.stock_movements?.reason || 'Entrada',
          reference: l.stock_movements?.reference ?? null,
        });
      });
      (logs.data || []).forEach((c) => {
        const diff = c.quantity_after - c.quantity_before;
        if (diff <= 0) return;
        out.push({ key: `c-${c.id}`, colis: c.colis_number, date: c.created_at, quantity: diff, location: null, origin: 'Contagem', reference: null });
      });
      return out.sort((a, b) => b.date.localeCompare(a.date));
    },
  });
}

export function ColisEntryDates({ productId, totalColis }: { productId: string; totalColis: number }) {
  const { data, isLoading, error } = useColisEntryDates(productId);
  if (isLoading) return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (error) return <p className="text-sm text-destructive">Não foi possível carregar as datas de entrada.</p>;
  const rows = data || [];
  const colisList = Array.from(new Set([...Array.from({ length: Math.max(totalColis, 1) }, (_, i) => i + 1), ...rows.map((r) => r.colis)])).sort((a, b) => a - b);

  return (
    <div className="space-y-3">
      {colisList.map((n) => {
        const list = rows.filter((r) => r.colis === n);
        return (
          <div key={n} className="rounded-lg border border-border-subtle p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium">
                <Package className="h-4 w-4 text-muted-foreground" /> Coli {n}/{totalColis}
              </span>
              {list[0] && (
                <span className="text-xs text-muted-foreground">Última entrada: <strong className="text-foreground">{format(new Date(list[0].date), 'dd/MM/yyyy')}</strong></span>
              )}
            </div>
            {list.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem entradas registadas para este coli.</p>
            ) : (
              <div className="space-y-1">
                {list.map((r) => (
                  <div key={r.key} className="flex items-center gap-2 rounded bg-muted/50 px-2 py-1.5 text-xs">
                    <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="tabular-nums font-medium">{format(new Date(r.date), 'dd/MM/yyyy HH:mm')}</span>
                    <Badge variant="outline" className="text-[10px]">{r.origin}</Badge>
                    {r.location && <span className="truncate text-muted-foreground">{r.location}</span>}
                    {r.reference && <span className="truncate text-muted-foreground">· {r.reference}</span>}
                    <span className="ml-auto tabular-nums font-semibold">+{r.quantity}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
