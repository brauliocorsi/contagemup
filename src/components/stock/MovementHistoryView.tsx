import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Download, Filter, User, Package, Search, X } from 'lucide-react';
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

type Row = MovementRow & { created_by: string | null; notes?: string | null };

interface OperationGroup {
  key: string;
  type: string;
  created_at: string;
  created_by: string | null;
  reason: string | null;
  reference: string | null;
  rows: Row[];
  totalUnits: number;
  productCount: number;
  allReversed: boolean;
}

export function MovementHistoryView() {
  const { products } = useProducts();
  const [type, setType] = useState<'all' | 'entrada' | 'saida'>('all');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [place, setPlace] = useState('');
  const [person, setPerson] = useState('all');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [advanced, setAdvanced] = useState(false);


  const productMap = useMemo(() => {
    const m = new Map<string, Product>();
    products.forEach(p => m.set(p.id, p));
    return m;
  }, [products]);

  const { data: profiles = [] } = useQuery({
    queryKey: ['movement-history-profiles'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('user_id, name');
      return (data || []) as { user_id: string; name: string }[];
    },
  });

  const userNames = useMemo(() => {
    const m = new Map<string, string>();
    profiles.forEach(p => m.set(p.user_id, p.name));
    return m;
  }, [profiles]);

  const { data, isLoading } = useQuery({
    queryKey: ['movement-history', type, from, to],
    queryFn: async (): Promise<{ rows: Row[]; lines: Map<string, MovementLine[]> }> => {
      const rows: Row[] = [];
      const pageSize = 1000;
      const maxRows = 5000;
      for (let page = 0; page * pageSize < maxRows; page++) {
        let q = supabase
          .from('stock_movements_unified')
          .select('id, product_id, movement_type, quantity, reason, reference, notes, created_at, created_by, origem, reversed_at, reverses_movement_id')
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(page * pageSize, page * pageSize + pageSize - 1);
        if (type !== 'all') q = q.eq('movement_type', type);
        if (from) q = q.gte('created_at', `${from}T00:00:00`);
        if (to) q = q.lte('created_at', `${to}T23:59:59`);
        const { data: rowData, error } = await q;
        if (error) throw error;
        rows.push(...((rowData || []) as Row[]));
        if (!rowData || rowData.length < pageSize) break;
      }


      const lines = new Map<string, MovementLine[]>();
      const ids = rows.map(r => r.id);
      if (ids.length > 0) {
        for (let i = 0; i < ids.length; i += 200) {
          const chunk = ids.slice(i, i + 200);
          // paginação: uma chamada devolve no máximo 1000 linhas
          let page = 0;
          const pageSize = 1000;
          while (true) {
            const { data: lineData, error: lineErr } = await supabase
              .from('stock_movement_lines')
              .select('id, movement_id, colis_number, quantity, location')
              .in('movement_id', chunk)
              .order('id', { ascending: true })
              .range(page * pageSize, page * pageSize + pageSize - 1);
            if (lineErr) throw lineErr;
            (lineData || []).forEach(l => {
              const arr = lines.get(l.movement_id) || [];
              arr.push(l as MovementLine);
              lines.set(l.movement_id, arr);
            });
            if (!lineData || lineData.length < pageSize) break;
            page++;
          }
        }
      }

      return { rows, lines };
    },
  });

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const lines = useMemo(() => data?.lines ?? new Map<string, MovementLine[]>(), [data]);

  const peopleOptions = useMemo(() => {
    const ids = Array.from(new Set(rows.map(r => r.created_by).filter(Boolean))) as string[];
    return ids.map(id => ({ id, name: userNames.get(id) || 'Desconhecido' }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, userNames]);

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    const placeTerm = place.toLowerCase().trim();
    return rows.filter(r => {
      if (person !== 'all' && r.created_by !== person) return false;
      if (term) {
        const p = productMap.get(r.product_id);
        const hay = `${p?.code ?? ''} ${p?.name ?? ''} ${r.reason ?? ''} ${r.reference ?? ''}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      if (placeTerm) {
        const ls = lines.get(r.id) ?? [];
        const match = ls.some(l =>
          `${l.location ?? ''}`.toLowerCase().includes(placeTerm));
        if (!match) return false;
      }
      return true;
    });
  }, [rows, lines, productMap, search, place, person]);

  const groups = useMemo(() => {
    const map = new Map<string, OperationGroup>();
    filtered.forEach(r => {
      const key = [r.movement_type, r.created_at, r.created_by ?? '', r.reason ?? '', r.reference ?? ''].join('|');
      let g = map.get(key);
      if (!g) {
        g = {
          key,
          type: r.movement_type,
          created_at: r.created_at,
          created_by: r.created_by,
          reason: r.reason ?? null,
          reference: r.reference ?? null,
          rows: [],
          totalUnits: 0,
          productCount: 0,
          allReversed: true,
        };
        map.set(key, g);
      }
      g.rows.push(r);
      g.totalUnits += r.quantity;
      if (!r.reversed_at) g.allReversed = false;
    });
    const list = Array.from(map.values());
    list.forEach(g => { g.productCount = new Set(g.rows.map(r => r.product_id)).size; });
    return list.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  }, [filtered]);

  const exportCsv = () => {
    const header = ['Data', 'Operação', 'Tipo', 'Responsável', 'Motivo', 'Referência', 'Código', 'Produto', 'Quantidade', 'Detalhe', 'Estado'];
    const body: (string | number)[][] = [];
    groups.forEach((g, idx) => {
      const opId = `OP-${format(new Date(g.created_at), 'yyyyMMdd-HHmm')}-${idx + 1}`;
      g.rows.forEach(r => {
        const p = productMap.get(r.product_id);
        const detail = (lines.get(r.id) ?? [])
          .sort((a, b) => a.colis_number - b.colis_number)
          .map(formatLine)
          .join(' | ');
        body.push([
          format(new Date(r.created_at), 'yyyy-MM-dd HH:mm'),
          opId,
          r.movement_type,
          (r.created_by && userNames.get(r.created_by)) || '',
          r.reason ?? '',
          r.reference ?? '',
          p?.code ?? '',
          p?.name ?? '',
          r.quantity,
          detail,
          r.reversed_at ? 'anulado' : (r.reverses_movement_id ? 'reversão' : 'ativo'),
        ]);
      });
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

  const totals = useMemo(() => {
    let entradas = 0, saidas = 0;
    filtered.forEach(r => {
      if (r.reversed_at) return;
      if (r.movement_type === 'entrada') entradas += r.quantity; else saidas += r.quantity;
    });
    return { entradas, saidas };
  }, [filtered]);

  const activeFilters = [
    type !== 'all' && { key: 'type', label: type === 'entrada' ? 'Entradas' : 'Saídas', clear: () => setType('all') },
    person !== 'all' && { key: 'person', label: `Resp: ${userNames.get(person) || 'Desconhecido'}`, clear: () => setPerson('all') },
    !!search.trim() && { key: 'search', label: `“${search.trim()}”`, clear: () => setSearch('') },
    !!place.trim() && { key: 'place', label: `Local: ${place.trim()}`, clear: () => setPlace('') },
    !!from && { key: 'from', label: `De ${from}`, clear: () => setFrom('') },
    !!to && { key: 'to', label: `Até ${to}`, clear: () => setTo('') },
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[];

  const clearAll = () => {
    setType('all'); setPerson('all'); setSearch(''); setPlace(''); setFrom(''); setTo('');
  };

  const setPreset = (days: number | null) => {
    if (days === null) { setFrom(''); setTo(''); return; }
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    setFrom(format(start, 'yyyy-MM-dd'));
    setTo(format(end, 'yyyy-MM-dd'));
  };

  const allOpen = groups.length > 0 && groups.every(g => open[g.key]);
  const toggleAll = () => {
    if (allOpen) { setOpen({}); return; }
    const next: Record<string, boolean> = {};
    groups.forEach(g => { next[g.key] = true; });
    setOpen(next);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-3 space-y-3">
          {/* Linha principal: pesquisa + ações */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar por código, produto, motivo ou referência…"
                className="pl-8"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant={advanced ? 'default' : 'outline'}
                size="sm"
                className="gap-2"
                onClick={() => setAdvanced(v => !v)}
              >
                <Filter className="h-4 w-4" /> Filtros
                {activeFilters.length > 0 && (
                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{activeFilters.length}</Badge>
                )}
              </Button>
              <Button variant="outline" size="sm" className="gap-2" onClick={exportCsv} disabled={groups.length === 0}>
                <Download className="h-4 w-4" /> CSV
              </Button>
            </div>
          </div>

          {/* Atalhos de tipo e período */}
          <div className="flex flex-wrap items-center gap-1.5">
            {([['all', 'Todos'], ['entrada', 'Entradas'], ['saida', 'Saídas']] as const).map(([v, label]) => (
              <Button
                key={v}
                size="sm"
                variant={type === v ? 'default' : 'outline'}
                className="h-7 px-3 text-xs"
                onClick={() => setType(v)}
              >
                {label}
              </Button>
            ))}
            <span className="mx-1 h-4 w-px bg-border" />
            {([[0, 'Hoje'], [7, '7 dias'], [30, '30 dias'], [null, 'Tudo']] as [number | null, string][]).map(([d, label]) => (
              <Button
                key={label}
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => setPreset(d)}
              >
                {label}
              </Button>
            ))}
          </div>

          {/* Filtros avançados */}
          {advanced && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-1 border-t">
              <div className="space-y-1 pt-2">
                <Label className="text-xs">Responsável</Label>
                <Select value={person} onValueChange={setPerson}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {peopleOptions.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 md:pt-2">
                <Label className="text-xs">Localização</Label>
                <Input className="h-9" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Ex: B9" />
              </div>
              <div className="space-y-1 md:pt-2">
                <Label className="text-xs">De</Label>
                <Input className="h-9" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="space-y-1 md:pt-2">
                <Label className="text-xs">Até</Label>
                <Input className="h-9" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </div>
          )}

          {/* Chips ativos */}
          {activeFilters.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {activeFilters.map(f => (
                <Badge key={f.key} variant="secondary" className="gap-1 text-xs font-normal">
                  {f.label}
                  <button type="button" onClick={f.clear} aria-label={`Remover filtro ${f.label}`}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={clearAll}>Limpar tudo</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex flex-wrap items-center gap-2">
            Operações <span className="text-sm font-normal text-muted-foreground">({groups.length})</span>
            <span className="ml-auto flex items-center gap-2 text-xs font-normal">
              <Badge variant="secondary">+{totals.entradas} un. entradas</Badge>
              <Badge variant="destructive">−{totals.saidas} un. saídas</Badge>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={toggleAll} disabled={groups.length === 0}>
                {allOpen ? 'Colapsar tudo' : 'Expandir tudo'}
              </Button>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">A carregar…</p>
          ) : groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem movimentos para estes filtros.</p>
          ) : (
            <ScrollArea className="h-[600px] w-full">

              <ul className="space-y-2 pr-3">
                {groups.map(g => {
                  const isOpen = !!open[g.key];
                  return (
                    <li key={g.key} className={cn('rounded-lg border', g.allReversed && 'opacity-60')}>
                      <button
                        type="button"
                        onClick={() => setOpen(o => ({ ...o, [g.key]: !o[g.key] }))}
                        className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/50 transition-colors rounded-lg"
                      >
                        {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={g.type === 'entrada' ? 'secondary' : 'destructive'} className="text-xs">
                              {g.type === 'entrada' ? 'Entrada' : 'Saída'}
                            </Badge>
                            <span className="text-sm font-medium">
                              {g.productCount} produto{g.productCount === 1 ? '' : 's'} · {g.totalUnits} un.
                            </span>
                            {g.allReversed && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 border-destructive text-destructive">anulado</Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-0.5">
                            <span>{format(new Date(g.created_at), 'dd/MM/yyyy HH:mm')}</span>
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {(g.created_by && userNames.get(g.created_by)) || 'Sistema'}
                            </span>
                            {g.reason && <span>· {g.reason}</span>}
                            {g.reference && <span>· ref {g.reference}</span>}
                          </div>
                        </div>
                      </button>

                      {isOpen && (
                        <div className="border-t px-3 py-2 space-y-2">
                          {g.rows.map(r => {
                            const p = productMap.get(r.product_id);
                            const rowLines = (lines.get(r.id) ?? []).sort((a, b) => a.colis_number - b.colis_number);
                            return (
                              <div key={r.id} className={cn('text-sm', r.reversed_at && 'opacity-60')}>
                                <div className="flex items-start justify-between gap-2">
                                  <span className="flex items-start gap-2 min-w-0">
                                    <Package className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                                    <span className="min-w-0">
                                      <span className="block truncate">{p?.name ?? 'Produto desconhecido'}</span>
                                      <span className="block text-xs font-mono text-muted-foreground">
                                        {p?.code ?? r.product_id.slice(0, 8)}
                                      </span>
                                    </span>
                                  </span>
                                  <Badge variant={r.movement_type === 'entrada' ? 'secondary' : 'destructive'} className="text-xs shrink-0">
                                    {r.movement_type === 'entrada' ? '+' : '−'}{r.quantity}
                                  </Badge>
                                </div>
                                {rowLines.length > 0 && (
                                  <div className="mt-1 flex flex-wrap gap-1 pl-6">
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
                                {r.notes && <p className="pl-6 text-xs italic text-muted-foreground">{r.notes}</p>}
                              </div>
                            );
                          })}
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
