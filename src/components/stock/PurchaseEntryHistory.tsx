import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { History, Search, Package, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';

interface MovementRow {
  id: string;
  product_id: string;
  quantity: number;
  reason: string | null;
  reference: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  products?: { code: string; name: string } | null;
}

interface Grouped {
  reference: string;
  numero: string;
  fornecedor: string;
  firstDate: string;
  lastDate: string;
  totalUnits: number;
  items: MovementRow[];
}

const parseReference = (ref: string) => {
  // "Compra GC #<numero> — <fornecedor>"
  const m = ref.match(/^Compra GC #([^\s—-]+)\s*(?:[—-]\s*(.+))?$/);
  return {
    numero: m?.[1]?.trim() || ref.replace(/^Compra GC #/, ''),
    fornecedor: m?.[2]?.trim() || '—',
  };
};

export function PurchaseEntryHistory() {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ['purchase-entries-history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_movements')
        .select('id, product_id, quantity, reason, reference, notes, created_at, created_by, products(code, name)')
        .eq('movement_type', 'entrada')
        .ilike('reference', 'Compra GC #%')
        .order('created_at', { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data || []) as unknown as MovementRow[];
    },
  });

  const grouped: Grouped[] = useMemo(() => {
    const map = new Map<string, Grouped>();
    for (const m of data || []) {
      const ref = m.reference || '';
      if (!ref) continue;
      const { numero, fornecedor } = parseReference(ref);
      const g = map.get(ref);
      if (g) {
        g.items.push(m);
        g.totalUnits += m.quantity;
        if (m.created_at < g.firstDate) g.firstDate = m.created_at;
        if (m.created_at > g.lastDate) g.lastDate = m.created_at;
      } else {
        map.set(ref, {
          reference: ref,
          numero,
          fornecedor,
          firstDate: m.created_at,
          lastDate: m.created_at,
          totalUnits: m.quantity,
          items: [m],
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.lastDate.localeCompare(a.lastDate));
  }, [data]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return grouped;
    return grouped.filter(g =>
      g.numero.toLowerCase().includes(term) ||
      g.fornecedor.toLowerCase().includes(term) ||
      g.items.some(i =>
        (i.products?.code || '').toLowerCase().includes(term) ||
        (i.products?.name || '').toLowerCase().includes(term)
      )
    );
  }, [grouped, search]);

  const toggle = (ref: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(ref)) next.delete(ref); else next.add(ref);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4" />
            Histórico de Entradas por Compra
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filtrar por nº compra, fornecedor, código ou produto…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> A carregar histórico…
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            Nenhuma entrada por compra registada{search ? ' para essa pesquisa' : ' ainda'}.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(g => {
            const isOpen = expanded.has(g.reference);
            return (
              <Card key={g.reference}>
                <CardContent className="p-0">
                  <button
                    type="button"
                    onClick={() => toggle(g.reference)}
                    className="w-full flex items-center gap-3 p-4 hover:bg-muted/40 transition-colors text-left"
                  >
                    {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                    <Badge variant="secondary" className="font-mono">#{g.numero}</Badge>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{g.fornecedor}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(g.lastDate), "dd 'de' MMM yyyy, HH:mm", { locale: pt })}
                      </p>
                    </div>
                    <Badge variant="outline" className="gap-1">
                      <Package className="h-3 w-3" />
                      {g.items.length} {g.items.length === 1 ? 'item' : 'itens'}
                    </Badge>
                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">
                      {g.totalUnits} un.
                    </Badge>
                  </button>

                  {isOpen && (
                    <div className="border-t">
                      <ScrollArea className="max-h-[420px]">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Código</TableHead>
                              <TableHead>Produto</TableHead>
                              <TableHead className="text-right w-24">Qtd.</TableHead>
                              <TableHead className="w-44">Data</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {g.items.map(it => (
                              <TableRow key={it.id}>
                                <TableCell className="font-mono text-xs">{it.products?.code || '—'}</TableCell>
                                <TableCell className="max-w-[380px] truncate">{it.products?.name || '—'}</TableCell>
                                <TableCell className="text-right">{it.quantity}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {format(new Date(it.created_at), "dd/MM/yy HH:mm", { locale: pt })}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
