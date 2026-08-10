import { useMemo, useState } from 'react';
import { Download, Filter } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useProducts } from '@/hooks/useProducts';
import { formatLine, type MovementLine, type MovementRow } from './RecentMovementsPanel';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { Product } from '@/types/stock';

export function MovementHistoryView() {
  const { products } = useProducts();
  const [type, setType] = useState<'all' | 'entrada' | 'saida'>('all');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [place, setPlace] = useState('');

  const productMap = useMemo(() => {
    const m = new Map<string, Product>();
    products.forEach(p => m.set(p.id, p));
    return m;
  }, [products]);

  const { data, isLoading } = useQuery({
    queryKey: ['movement-history', type, from, to],
    queryFn: async (): Promise<{ rows: MovementRow[]; lines: Map<string, MovementLine[]> }> => {
      let q = supabase
        .from('stock_movements_unified')
        .select('id, product_id, movement_type, quantity, reason, reference, created_at, origem, reversed_at, reverses_movement_id')
        .order('created_at', { ascending: false })
        .limit(500);
      if (type !== 'all') q = q.eq('movement_type', type);
      if (from) q = q.gte('created_at', `${from}T00:00:00`);
      if (to) q = q.lte('created_at', `${to}T23:59:59`);
      const { data: rowData, error } = await q;
      if (error) throw error;
      const rows = (rowData || []) as MovementRow[];

      const lines = new Map<string, MovementLine[]>();
      const ids = rows.map(r => r.id);
      if (ids.length > 0) {
        for (let i = 0; i < ids.length; i += 200) {
          const { data: lineData } = await supabase
            .from('stock_movement_lines')
            .select('id, movement_id, colis_number, quantity, location, pallet_number')
            .in('movement_id', ids.slice(i, i + 200));
          (lineData || []).forEach(l => {
            const arr = lines.get(l.movement_id) || [];
            arr.push(l as MovementLine);
            lines.set(l.movement_id, arr);
          });
        }
      }
      return { rows, lines };
    },
  });

  const rows = data?.rows ?? [];
  const lines = data?.lines ?? new Map<string, MovementLine[]>();

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    const placeTerm = place.toLowerCase().trim();
    return rows.filter(r => {
      const p = productMap.get(r.product_id);
      if (term) {
        const hay = `${p?.code ?? ''} ${p?.name ?? ''} ${r.reason ?? ''} ${r.reference ?? ''}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      if (placeTerm) {
        const ls = lines.get(r.id) ?? [];
        const match = ls.some(l =>
          `${l.location ?? ''} ${l.pallet_number ?? ''}`.toLowerCase().includes(placeTerm));
        if (!match) return false;
      }
      return true;
    });
  }, [rows, lines, productMap, search, place]);

  const exportCsv = () => {
    const header = ['Data', 'Tipo', 'Código', 'Produto', 'Quantidade', 'Motivo', 'Referência', 'Detalhe', 'Estado'];
    const body = filtered.map(r => {
      const p = productMap.get(r.product_id);
      const detail = (lines.get(r.id) ?? [])
        .sort((a, b) => a.colis_number - b.colis_number)
        .map(formatLine)
        .join(' | ');
      return [
        format(new Date(r.created_at), 'yyyy-MM-dd HH:mm'),
        r.movement_type,
        p?.code ?? '',
        p?.name ?? '',
        r.quantity,
        r.reason ?? '',
        r.reference ?? '',
        detail,
        r.reversed_at ? 'anulado' : (r.reverses_movement_id ? 'reversão' : 'ativo'),
      ];
    });
    const csv = [header, ...body]
      .map(line => line.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `movimentos-stock-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filtros
            <Button variant="outline" size="sm" className="ml-auto gap-2" onClick={exportCsv} disabled={filtered.length === 0}>
              <Download className="h-4 w-4" /> Exportar CSV
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Tipo</Label>
            <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="entrada">Entradas</SelectItem>
                <SelectItem value="saida">Saídas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Produto / motivo</Label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Código, nome…" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Localização / palete</Label>
            <Input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Ex: B9, PLT057" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">De</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Até</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Movimentos <span className="text-sm font-normal text-muted-foreground">({filtered.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">A carregar…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem movimentos para estes filtros.</p>
          ) : (
            <ScrollArea className="max-h-[600px]">
              <ul className="space-y-3 pr-3">
                {filtered.map(r => {
                  const p = productMap.get(r.product_id);
                  const rowLines = (lines.get(r.id) ?? []).sort((a, b) => a.colis_number - b.colis_number);
                  return (
                    <li key={r.id} className={cn('border-b last:border-0 pb-3', r.reversed_at && 'opacity-60')}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium truncate">{p?.name ?? 'Produto desconhecido'}</span>
                        <Badge
                          variant={r.movement_type === 'entrada' ? 'secondary' : 'destructive'}
                          className="text-xs shrink-0"
                        >
                          {r.movement_type === 'entrada' ? '+' : '−'}{r.quantity}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-mono">{p?.code ?? r.product_id.slice(0, 8)}</span>
                        <span>{format(new Date(r.created_at), 'dd/MM/yyyy HH:mm')}</span>
                        {r.reason && <span>· {r.reason}</span>}
                        {r.reference && <span>· ref {r.reference}</span>}
                        {r.reversed_at && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0 border-destructive text-destructive">
                            anulado
                          </Badge>
                        )}
                        {r.reverses_movement_id && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0">reversão</Badge>
                        )}
                      </div>
                      {rowLines.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {rowLines.map(l => (
                            <Badge
                              key={l.id}
                              variant="outline"
                              className={cn('text-[10px] px-1.5 py-0', !l.location && 'border-amber-400 text-amber-700')}
                            >
                              {formatLine(l)}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
