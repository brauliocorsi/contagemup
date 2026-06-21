import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  TrendingDown, History, Truck, Search, Package, Layers, Plus, X,
  MapPin, Box, Star, AlertTriangle, ShoppingCart, Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { NumericInput } from '@/components/ui/numeric-input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useProducts } from '@/hooks/useProducts';
import { useCategories } from '@/hooks/useCategories';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { pt } from 'date-fns/locale';
import type { Product } from '@/types/stock';
import { PickingHistoryView } from './PickingHistoryView';
import { ERPExitsView, ERPExitCartItem } from './ERPExitsView';

const EXIT_REASONS = [
  'Venda', 'Quebra', 'Perda', 'Transferência',
  'Devolução a fornecedor', 'Ajuste de inventário', 'Amostra', 'Outro',
];

// ---------------------------------------------------------------------------
// Cart item types
// ---------------------------------------------------------------------------
interface CartItem {
  product_id: string;
  product_code: string;
  product_name: string;
  total_colis: number;
  mode: 'set' | 'individual';
  setQuantity: number;
  colisQuantities: Record<number, number>;
  // selections: per coli, map countId -> qty chosen
  selections: Record<number, Record<string, number>>;
}

interface CountLocationRow {
  id: string; // count id
  quantity: number;
  location: string | null;
  pallet_number: string | null;
  level_number: number | null;
  requires_forklift: boolean;
}

type LocationsByColi = Record<number, CountLocationRow[]>;

// ---------------------------------------------------------------------------
// Wrapper view (tabs)
// ---------------------------------------------------------------------------
export function StockExitsView() {
  const [activeTab, setActiveTab] = useState('carrinho');
  const [externalAdd, setExternalAdd] = useState<ERPExitCartItem[] | null>(null);

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
      <TabsList>
        <TabsTrigger value="carrinho" className="flex items-center gap-2">
          <TrendingDown className="h-4 w-4" /> Saídas
        </TabsTrigger>
        <TabsTrigger value="historico" className="flex items-center gap-2">
          <History className="h-4 w-4" /> Histórico de Picking
        </TabsTrigger>
        <TabsTrigger value="erp" className="flex items-center gap-2">
          <Truck className="h-4 w-4" /> Saídas do ERP
        </TabsTrigger>
      </TabsList>

      <TabsContent value="carrinho" className="space-y-6">
        <ExitCart externalAdd={externalAdd} onExternalConsumed={() => setExternalAdd(null)} />
      </TabsContent>

      <TabsContent value="historico">
        <PickingHistoryView />
      </TabsContent>

      <TabsContent value="erp">
        <ERPExitsView onSendToCart={(items) => {
          setExternalAdd(items);
          setActiveTab('carrinho');
        }} />
      </TabsContent>
    </Tabs>
  );
}

// ---------------------------------------------------------------------------
// Main Exit Cart
// ---------------------------------------------------------------------------
interface ExitCartProps {
  externalAdd: ERPExitCartItem[] | null;
  onExternalConsumed: () => void;
}

function ExitCart({ externalAdd, onExternalConsumed }: ExitCartProps) {
  const queryClient = useQueryClient();
  const { products } = useProducts();
  const { categories } = useCategories();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [reason, setReason] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Product picker
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');

  const categoryColisCount = useCallback((category: string) => {
    const cat = categories.find(c => c.name === category);
    if (!cat?.colis_names) return 0;
    return Object.keys(cat.colis_names).length;
  }, [categories]);

  const effectiveColis = useCallback((p: Product) => {
    return Math.max(p.total_colis || 1, categoryColisCount(p.category) || 0, 1);
  }, [categoryColisCount]);

  const filteredProducts = useMemo(() => {
    const term = search.toLowerCase().trim();
    const list = !term
      ? products.slice(0, 50)
      : products
          .filter(p => p.code.toLowerCase().includes(term) || p.name.toLowerCase().includes(term))
          .slice(0, 50);
    return list;
  }, [products, search]);

  const addProductToCart = useCallback((p: Product) => {
    setCart(prev => {
      if (prev.some(i => i.product_id === p.id)) {
        toast.info(`${p.name} já está no carrinho`);
        return prev;
      }
      const totalColis = effectiveColis(p);
      return [...prev, {
        product_id: p.id,
        product_code: p.code,
        product_name: p.name,
        total_colis: totalColis,
        mode: 'set',
        setQuantity: 1,
        colisQuantities: Object.fromEntries(
          Array.from({ length: totalColis }, (_, i) => [i + 1, 0])
        ),
        selections: {},
      }];
    });
  }, [effectiveColis]);

  // Handle external (ERP) additions
  useEffect(() => {
    if (!externalAdd || externalAdd.length === 0) return;
    externalAdd.forEach(item => {
      const p = products.find(pp => pp.id === item.product_id);
      if (!p) return;
      setCart(prev => {
        const existing = prev.find(i => i.product_id === p.id);
        if (existing) {
          return prev.map(i => i.product_id === p.id
            ? { ...i, setQuantity: i.setQuantity + (item.quantity || 1) }
            : i);
        }
        const totalColis = effectiveColis(p);
        return [...prev, {
          product_id: p.id,
          product_code: p.code,
          product_name: p.name,
          total_colis: totalColis,
          mode: 'set',
          setQuantity: item.quantity || 1,
          colisQuantities: Object.fromEntries(
            Array.from({ length: totalColis }, (_, i) => [i + 1, 0])
          ),
          selections: {},
        }];
      });
    });
    onExternalConsumed();
  }, [externalAdd, products, effectiveColis, onExternalConsumed]);

  const updateItem = useCallback((productId: string, patch: Partial<CartItem>) => {
    setCart(prev => prev.map(i => i.product_id === productId ? { ...i, ...patch } : i));
  }, []);

  const removeItem = useCallback((productId: string) => {
    setCart(prev => prev.filter(i => i.product_id !== productId));
  }, []);

  // ---- Build p_items for commit_exit_cart -------------------------------
  // This is the function that converts cart UI state into the RPC payload.
  const buildPItems = useCallback(() => {
    return cart.map(item => {
      const location_selections: Array<{ colisNumber: number; countId: string; quantityToDeduct: number }> = [];
      for (const [coliStr, sel] of Object.entries(item.selections)) {
        const colisNumber = Number(coliStr);
        for (const [countId, qty] of Object.entries(sel)) {
          if (qty > 0) location_selections.push({ colisNumber, countId, quantityToDeduct: qty });
        }
      }
      if (item.mode === 'set') {
        return {
          product_id: item.product_id,
          is_complete_set: true,
          set_quantity: item.setQuantity,
          colis_quantities: {},
          location_selections,
        };
      }
      return {
        product_id: item.product_id,
        is_complete_set: false,
        set_quantity: 0,
        colis_quantities: item.colisQuantities,
        location_selections,
      };
    });
  }, [cart]);

  // ---- Submit ------------------------------------------------------------
  const handleSubmit = async () => {
    if (cart.length === 0) return;
    if (!reason) { toast.error('Selecione um motivo'); return; }

    setSubmitting(true);
    try {
      const p_items = buildPItems();
      const { data, error } = await supabase.rpc('commit_exit_cart', {
        p_items: p_items as unknown as never,
        p_reason: reason,
        p_reference: reference || null,
        p_notes: notes || null,
      });
      if (error) throw error;

      const result = data as unknown as {
        items: Array<{ product_id: string; unit: string; requested: number; fulfilled: number; status: 'full' | 'partial' | 'none' }>;
        fully_fulfilled: boolean;
      };

      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['counts'] });
      queryClient.invalidateQueries({ queryKey: ['recent-exits'] });
      queryClient.invalidateQueries({ queryKey: ['exit-locations'] });

      if (result.fully_fulfilled) {
        toast.success('Saída concluída — stock atualizado.');
        setCart([]);
        setReference(''); setNotes('');
        return;
      }

      // Partial — show summary and keep remaining
      const lines: string[] = [];
      const remainingMap = new Map<string, { requested: number; fulfilled: number; unit: string; status: 'full' | 'partial' | 'none' }>();
      result.items.forEach(r => {
        remainingMap.set(r.product_id, { requested: r.requested, fulfilled: r.fulfilled, unit: r.unit, status: r.status });
        const p = cart.find(c => c.product_id === r.product_id);
        const name = p?.product_name ?? r.product_id.slice(0, 8);
        if (r.status === 'full') {
          lines.push(`✓ ${name}: ${r.fulfilled}/${r.requested} ${r.unit}`);
        } else if (r.status === 'partial') {
          lines.push(`⚠ ${name}: ${r.fulfilled}/${r.requested} ${r.unit} (falta ${r.requested - r.fulfilled})`);
        } else {
          lines.push(`✗ ${name}: 0/${r.requested} ${r.unit}`);
        }
      });
      toast.warning('Saída parcial', { description: lines.join('\n'), duration: 10000 });

      // Keep only items with shortfall, reduce quantities to the missing part
      setCart(prev => prev
        .map(it => {
          const r = remainingMap.get(it.product_id);
          if (!r || r.status === 'full') return null;
          const missing = r.requested - r.fulfilled;
          if (missing <= 0) return null;
          if (it.mode === 'set') {
            return { ...it, setQuantity: missing, selections: {} };
          }
          // individual: shrink each coli quantity proportionally is complex; simplest: reset selections, keep quantities
          return { ...it, selections: {} };
        })
        .filter((x): x is CartItem => x !== null));
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : 'Erro desconhecido';
      toast.error(`Falha na saída: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  const totalItems = cart.length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-red-600" />
            Carrinho de saída
          </h2>
          <p className="text-sm text-muted-foreground">
            Rascunho — nada sai do stock até clicar em <span className="font-medium">"Concluir e retirar do stock"</span>.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Main */}
        <div className="xl:col-span-2 space-y-4">
          {/* Product picker */}
          <Card>
            <CardContent className="pt-6">
              <Label className="mb-2 block">Adicionar produto</Label>
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start gap-2">
                    <Search className="h-4 w-4" />
                    Procurar por código ou nome…
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[min(640px,90vw)]" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="código ou nome…"
                      value={search}
                      onValueChange={setSearch}
                    />
                    <CommandList>
                      <CommandEmpty>Sem resultados</CommandEmpty>
                      <CommandGroup>
                        {filteredProducts.map(p => (
                          <CommandItem
                            key={p.id}
                            value={p.id}
                            onSelect={() => {
                              addProductToCart(p);
                              setPickerOpen(false);
                              setSearch('');
                            }}
                          >
                            <Package className="h-4 w-4 mr-2 text-muted-foreground" />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">{p.name}</div>
                              <div className="text-xs text-muted-foreground font-mono">
                                {p.code} · stock {p.current_stock ?? 0}
                              </div>
                            </div>
                            <Plus className="h-4 w-4 ml-2" />
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </CardContent>
          </Card>

          {/* Cart items */}
          {cart.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Carrinho vazio. Adicione produtos para iniciar uma saída.
              </CardContent>
            </Card>
          ) : (
            cart.map(item => (
              <CartItemCard
                key={item.product_id}
                item={item}
                onChange={(patch) => updateItem(item.product_id, patch)}
                onRemove={() => removeItem(item.product_id)}
              />
            ))
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <Label>Motivo</Label>
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger><SelectValue placeholder="Selecione um motivo…" /></SelectTrigger>
                  <SelectContent>
                    {EXIT_REASONS.map(r => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Referência (opcional)</Label>
                <Input
                  placeholder="Ex: FAT-2024-001, Pedido #123…"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Notas (opcional)</Label>
                <Input
                  placeholder="Observações adicionais…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              <div className="pt-4 border-t space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Produtos no carrinho:</span>
                  <span className="font-medium">{totalItems}</span>
                </div>
                <Button
                  variant="destructive"
                  className="w-full gap-2"
                  onClick={handleSubmit}
                  disabled={cart.length === 0 || submitting}
                >
                  <Check className="h-4 w-4" />
                  {submitting ? 'A registar…' : 'Concluir e retirar do stock'}
                </Button>
                {cart.length > 0 && (
                  <Button variant="outline" className="w-full" onClick={() => setCart([])} disabled={submitting}>
                    Esvaziar carrinho
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <RecentExitsPanel />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single cart item card
// ---------------------------------------------------------------------------
interface CartItemCardProps {
  item: CartItem;
  onChange: (patch: Partial<CartItem>) => void;
  onRemove: () => void;
}

function CartItemCard({ item, onChange, onRemove }: CartItemCardProps) {
  // Fetch available locations grouped by coli
  const { data: locByColi = {}, isLoading } = useQuery({
    queryKey: ['exit-locations', item.product_id],
    queryFn: async (): Promise<LocationsByColi> => {
      const { data: counts, error } = await supabase
        .from('counts')
        .select('id, colis_number, quantity, location, pallet_number')
        .eq('product_id', item.product_id)
        .gt('quantity', 0);
      if (error) throw error;

      // Fetch location -> level metadata
      const codes = Array.from(new Set((counts || []).map(c => c.location).filter((x): x is string => !!x)));
      const levelMap = new Map<string, { level_number: number | null; requires_forklift: boolean }>();
      if (codes.length > 0) {
        const { data: locs } = await supabase
          .from('warehouse_locations')
          .select('code, level:warehouse_levels(level_number, requires_forklift)')
          .in('code', codes);
        (locs || []).forEach(l => {
          const lvl = (l as { level: { level_number: number | null; requires_forklift: boolean } | null }).level;
          levelMap.set(l.code, {
            level_number: lvl?.level_number ?? null,
            requires_forklift: lvl?.requires_forklift ?? false,
          });
        });
      }

      const grouped: LocationsByColi = {};
      (counts || []).forEach(c => {
        const meta = c.location ? levelMap.get(c.location) : undefined;
        const row: CountLocationRow = {
          id: c.id,
          quantity: c.quantity,
          location: c.location,
          pallet_number: c.pallet_number,
          level_number: meta?.level_number ?? null,
          requires_forklift: meta?.requires_forklift ?? false,
        };
        if (!grouped[c.colis_number]) grouped[c.colis_number] = [];
        grouped[c.colis_number].push(row);
      });

      // Sort each coli: requires_forklift=false first, then level_number asc, then qty desc
      Object.values(grouped).forEach(arr => {
        arr.sort((a, b) => {
          if (a.requires_forklift !== b.requires_forklift) return a.requires_forklift ? 1 : -1;
          const an = a.level_number ?? 9999;
          const bn = b.level_number ?? 9999;
          if (an !== bn) return an - bn;
          return b.quantity - a.quantity;
        });
      });
      return grouped;
    },
  });

  // Auto-select sugested locations when quantities change
  useEffect(() => {
    const required: Record<number, number> = {};
    if (item.mode === 'set') {
      for (let i = 1; i <= item.total_colis; i++) required[i] = item.setQuantity;
    } else {
      for (let i = 1; i <= item.total_colis; i++) required[i] = item.colisQuantities[i] || 0;
    }
    const newSelections: Record<number, Record<string, number>> = {};
    for (let i = 1; i <= item.total_colis; i++) {
      const req = required[i];
      if (req <= 0) { newSelections[i] = {}; continue; }
      const candidates = locByColi[i] || [];
      const existing = item.selections[i] || {};
      // If user has manual selections summing >= req, keep them
      const existingSum = Object.values(existing).reduce((s, n) => s + n, 0);
      if (existingSum > 0 && existing && Object.keys(existing).some(id => candidates.some(c => c.id === id))) {
        newSelections[i] = existing;
        continue;
      }
      // Auto-fill greedily from top of sorted list
      let remaining = req;
      const sel: Record<string, number> = {};
      for (const c of candidates) {
        if (remaining <= 0) break;
        const take = Math.min(c.quantity, remaining);
        sel[c.id] = take;
        remaining -= take;
      }
      newSelections[i] = sel;
    }
    // Only update if changed
    const same = JSON.stringify(newSelections) === JSON.stringify(item.selections);
    if (!same) onChange({ selections: newSelections });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.mode, item.setQuantity, JSON.stringify(item.colisQuantities), JSON.stringify(locByColi)]);

  const totalAvailableSets = useMemo(() => {
    if (item.total_colis === 1) {
      return (locByColi[1] || []).reduce((s, r) => s + r.quantity, 0);
    }
    let min = Infinity;
    for (let i = 1; i <= item.total_colis; i++) {
      const sum = (locByColi[i] || []).reduce((s, r) => s + r.quantity, 0);
      if (sum < min) min = sum;
    }
    return min === Infinity ? 0 : min;
  }, [locByColi, item.total_colis]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base truncate">{item.product_name}</CardTitle>
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              <span className="font-mono">{item.product_code}</span>
              <span>·</span>
              <span>Disponível: <span className="font-medium text-foreground">{totalAvailableSets} {item.mode === 'set' ? 'sets' : 'un. (mínimo por coli)'}</span></span>
              <span>·</span>
              <span>{item.total_colis} coli{item.total_colis > 1 ? 's' : ''}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={item.mode === 'set' ? 'default' : 'secondary'}>
              {item.mode === 'set' ? <><Layers className="h-3 w-3 mr-1" />Set completo</> : <><Package className="h-3 w-3 mr-1" />Colis avulso</>}
            </Badge>
            <Button size="icon" variant="ghost" onClick={onRemove} className="h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Mode toggle + quantity */}
        <div className="flex items-center gap-3 flex-wrap">
          {item.mode === 'set' ? (
            <>
              <Label className="text-sm">Sets:</Label>
              <NumericInput
                min={1}
                value={item.setQuantity}
                onChange={(v) => onChange({ setQuantity: v })}
                className="w-24 h-9 text-center"
              />
              {item.total_colis > 1 && (
                <Button variant="outline" size="sm" onClick={() => onChange({ mode: 'individual' })}>
                  <Package className="h-3.5 w-3.5 mr-1" /> Tirar colis avulso
                </Button>
              )}
            </>
          ) : (
            <>
              <Label className="text-sm">Por coli:</Label>
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: item.total_colis }, (_, i) => i + 1).map(n => (
                  <div key={n} className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">Coli {n}:</span>
                    <NumericInput
                      min={0}
                      value={item.colisQuantities[n] || 0}
                      onChange={(v) => onChange({
                        colisQuantities: { ...item.colisQuantities, [n]: v },
                      })}
                      className="w-16 h-8 text-center text-sm"
                    />
                  </div>
                ))}
              </div>
              <Button variant="ghost" size="sm" onClick={() => onChange({ mode: 'set' })}>
                <Layers className="h-3.5 w-3.5 mr-1" /> Voltar a set completo
              </Button>
            </>
          )}
        </div>

        {/* Location selection per coli */}
        <div className="space-y-2 pt-2 border-t">
          <div className="flex items-center gap-2 text-sm font-medium">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            Onde retirar (por coli)
          </div>
          {isLoading ? (
            <p className="text-xs text-muted-foreground">A carregar localizações…</p>
          ) : (
            Array.from({ length: item.total_colis }, (_, i) => i + 1).map(coliNum => {
              const required = item.mode === 'set' ? item.setQuantity : (item.colisQuantities[coliNum] || 0);
              if (required <= 0) return null;
              const candidates = locByColi[coliNum] || [];
              const selected = item.selections[coliNum] || {};
              const totalSelected = Object.values(selected).reduce((s, n) => s + n, 0);
              const ok = totalSelected >= required;

              return (
                <ColiLocationBlock
                  key={coliNum}
                  coliNumber={coliNum}
                  required={required}
                  totalSelected={totalSelected}
                  ok={ok}
                  candidates={candidates}
                  selected={selected}
                  onSelectionChange={(newSel) => onChange({
                    selections: { ...item.selections, [coliNum]: newSel },
                  })}
                />
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Coli location picker — shows sorted candidates with suggested top one
// ---------------------------------------------------------------------------
interface ColiLocationBlockProps {
  coliNumber: number;
  required: number;
  totalSelected: number;
  ok: boolean;
  candidates: CountLocationRow[];
  selected: Record<string, number>;
  onSelectionChange: (sel: Record<string, number>) => void;
}

function ColiLocationBlock({ coliNumber, required, totalSelected, ok, candidates, selected, onSelectionChange }: ColiLocationBlockProps) {
  if (candidates.length === 0) {
    return (
      <div className="p-3 rounded-md border border-destructive/40 bg-destructive/5 text-sm">
        <span className="font-medium">Coli {coliNumber}:</span> sem stock disponível.
      </div>
    );
  }

  const toggle = (c: CountLocationRow) => {
    const existing = selected[c.id];
    if (existing && existing > 0) {
      const copy = { ...selected };
      delete copy[c.id];
      onSelectionChange(copy);
    } else {
      const alreadySelected = totalSelected;
      const remaining = Math.max(0, required - alreadySelected);
      const take = Math.min(c.quantity, remaining || c.quantity);
      onSelectionChange({ ...selected, [c.id]: take });
    }
  };

  const updateQty = (id: string, qty: number) => {
    const cand = candidates.find(c => c.id === id);
    if (!cand) return;
    const clamped = Math.max(0, Math.min(qty, cand.quantity));
    const copy = { ...selected };
    if (clamped === 0) delete copy[id];
    else copy[id] = clamped;
    onSelectionChange(copy);
  };

  return (
    <div className={cn(
      'rounded-lg border-2 overflow-hidden',
      ok ? 'border-green-300' : 'border-amber-300'
    )}>
      <div className={cn(
        'px-3 py-2 flex items-center justify-between text-sm',
        ok ? 'bg-green-50' : 'bg-amber-50'
      )}>
        <span className="font-medium">Coli {coliNumber}</span>
        <Badge className={ok ? 'bg-green-600' : 'bg-amber-500'}>
          {totalSelected}/{required}
        </Badge>
      </div>
      <div className="p-2 space-y-1.5">
        {candidates.map((c, idx) => {
          const isSuggested = idx === 0;
          const isSelected = (selected[c.id] || 0) > 0;
          return (
            <div
              key={c.id}
              className={cn(
                'p-2 rounded-md border cursor-pointer transition-colors flex items-center gap-3',
                isSelected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
              )}
              onClick={() => toggle(c)}
            >
              <MapPin className={cn('h-4 w-4', c.location ? 'text-blue-600' : 'text-muted-foreground')} />
              <div className="flex-1 min-w-0 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{c.location || 'Sem localização'}</span>
                  {isSuggested && (
                    <Badge variant="outline" className="text-[10px] gap-1 border-yellow-400 text-yellow-700">
                      <Star className="h-2.5 w-2.5 fill-yellow-400" />
                      {c.requires_forklift ? 'recomendado' : 'nível baixo'}
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  {c.pallet_number ? (
                    <span className="flex items-center gap-1"><Box className="h-3 w-3" />{c.pallet_number}</span>
                  ) : <span className="italic">sem palete</span>}
                  {c.level_number !== null && (
                    <span>· nível {c.level_number}{c.requires_forklift ? ' (empilhador)' : ''}</span>
                  )}
                  <span>· {c.quantity} disponível</span>
                </div>
              </div>
              {isSelected && (
                <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1">
                  <Label className="text-xs text-muted-foreground">Retirar:</Label>
                  <NumericInput
                    min={0}
                    value={selected[c.id] || 0}
                    onChange={(v) => updateQty(c.id, v)}
                    className="w-16 h-8 text-center text-sm"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!ok && (
        <div className="px-3 py-2 bg-amber-50 border-t border-amber-200 text-xs text-amber-800 flex items-center gap-2">
          <AlertTriangle className="h-3 w-3" />
          Faltam {required - totalSelected} un. — saída será parcial.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recent exits panel
// ---------------------------------------------------------------------------
interface UnifiedRow {
  id: string;
  product_id: string;
  movement_type: string;
  quantity: number;
  reason: string | null;
  reference: string | null;
  created_at: string;
  origem: string;
}

function RecentExitsPanel() {
  const { products } = useProducts();
  const productMap = useMemo(() => {
    const m = new Map<string, Product>();
    products.forEach(p => m.set(p.id, p));
    return m;
  }, [products]);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['recent-exits'],
    queryFn: async (): Promise<UnifiedRow[]> => {
      const { data, error } = await (supabase as unknown as {
        from: (t: string) => {
          select: (q: string) => {
            eq: (col: string, v: string) => {
              order: (col: string, opts: { ascending: boolean }) => {
                limit: (n: number) => Promise<{ data: UnifiedRow[] | null; error: Error | null }>;
              };
            };
          };
        };
      })
        .from('stock_movements_unified')
        .select('id, product_id, movement_type, quantity, reason, reference, created_at, origem')
        .eq('movement_type', 'saida')
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 30_000,
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Saídas recentes</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">A carregar…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem saídas ainda.</p>
        ) : (
          <ScrollArea className="max-h-[360px]">
            <ul className="space-y-2 pr-3">
              {rows.map(r => {
                const p = productMap.get(r.product_id);
                return (
                  <li key={r.id} className="text-sm border-b last:border-0 pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">{p?.name ?? 'Produto desconhecido'}</span>
                      <Badge variant="secondary" className="text-xs">−{r.quantity}</Badge>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-mono">{p?.code ?? r.product_id.slice(0, 8)}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={cn('text-[10px] px-1 py-0', r.origem === 'arquivo' && 'bg-muted')}>
                          {r.origem}
                        </Badge>
                        <span>
                          {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: pt })}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
