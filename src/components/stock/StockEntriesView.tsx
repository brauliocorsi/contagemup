import { useState, useEffect, useMemo } from 'react';
import { TrendingUp, Search, Package, Layers, AlertTriangle, ClipboardList, X, Check, ShoppingCart, Pencil, History, ChevronDown, ChevronRight, Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { NumericInput } from '@/components/ui/numeric-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { LocationSelect } from '@/components/counting/LocationSelect';
import { PurchaseEntryView } from '@/components/stock/PurchaseEntryView';
import { PurchaseEntryHistory } from '@/components/stock/PurchaseEntryHistory';
import { RecentMovementsPanel } from '@/components/stock/RecentMovementsPanel';
import { UnlocatedStockPanel } from '@/components/stock/UnlocatedStockPanel';
import { MovementHistoryView } from '@/components/stock/MovementHistoryView';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useProducts } from '@/hooks/useProducts';
import { useCategories } from '@/hooks/useCategories';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { pt } from 'date-fns/locale';
import type { Product } from '@/types/stock';

const ENTRY_REASONS = [
  'Compra',
  'Devolução de cliente',
  'Transferência',
  'Ajuste de inventário',
  'Produção',
  'Outro',
];

interface ColiRow {
  colis_number: number;
  quantity: number;
  location: string;
  suggested_location: string | null;
}

interface CartItem {
  key: string;
  product: Product;
  rows: ColiRow[];
  totalUnits: number;
  orderNumber: string | null;
}


export function StockEntriesView() {
  const queryClient = useQueryClient();
  const { products } = useProducts();
  const { categories } = useCategories();

  // ------- Product selection ------------------------------------------------
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Product | null>(null);

  // ------- Form state -------------------------------------------------------
  const [mode, setMode] = useState<'set' | 'individual'>('set');
  const [setQuantity, setSetQuantity] = useState<number>(1);
  const [rows, setRows] = useState<ColiRow[]>([]);
  const [reason, setReason] = useState('');
  const [reference, setReference] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [missingWarning, setMissingWarning] = useState<{ items: CartItem[]; missing: string[] } | null>(null);

  // ------- Derived ----------------------------------------------------------
  const categoryColisCount = useMemo(() => {
    if (!selected) return 0;
    const cat = categories.find(c => c.name === selected.category);
    if (!cat?.colis_names) return 0;
    return Object.keys(cat.colis_names).length;
  }, [selected, categories]);

  const effectiveTotalColis = useMemo(() => {
    if (!selected) return 1;
    return Math.max(selected.total_colis || 1, categoryColisCount || 0, 1);
  }, [selected, categoryColisCount]);

  const requiresOrderNumber = useMemo(() => {
    if (!selected) return false;
    const cat = categories.find(c => c.name === selected.category);
    return cat?.requires_order_number ?? false;
  }, [selected, categories]);

  const filteredProducts = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return products.slice(0, 50);
    return products
      .filter(p => p.code.toLowerCase().includes(term) || p.name.toLowerCase().includes(term))
      .slice(0, 50);
  }, [products, search]);

  // ------- Load suggested locations once product is picked ------------------
  useEffect(() => {
    if (!selected) {
      setRows([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('counts')
        .select('colis_number, location, quantity, updated_at')
        .eq('product_id', selected.id)
        .gt('quantity', 0)
        .order('updated_at', { ascending: false });

      // pick first (most recent) per coli
      const byColi = new Map<number, { location: string | null }>();
      (data || []).forEach(r => {
        if (!byColi.has(r.colis_number)) {
          byColi.set(r.colis_number, { location: r.location });
        }
      });

      if (cancelled) return;
      const initial: ColiRow[] = Array.from({ length: effectiveTotalColis }, (_, i) => {
        const n = i + 1;
        const suggestion = byColi.get(n);
        const loc = suggestion?.location ?? selected.location ?? '';
        return {
          colis_number: n,
          quantity: mode === 'set' ? setQuantity : 0,
          location: loc,
          suggested_location: suggestion?.location ?? null,
        };
      });
      setRows(initial);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, effectiveTotalColis]);

  // When in "set" mode, sync quantity across all rows
  useEffect(() => {
    if (mode !== 'set') return;
    setRows(prev => prev.map(r => ({ ...r, quantity: setQuantity })));
  }, [mode, setQuantity]);

  // ------- Helpers ----------------------------------------------------------
  const updateRow = (n: number, patch: Partial<ColiRow>) => {
    setRows(prev => prev.map(r => r.colis_number === n ? { ...r, ...patch } : r));
  };

  const totalUnits = rows.reduce((s, r) => s + (r.quantity || 0), 0);
  const positiveRows = rows.filter(r => r.quantity > 0);
  const someZero = rows.length > 0 && rows.some(r => r.quantity === 0) && positiveRows.length > 0;
  const allZero = positiveRows.length === 0;

  const clearProductForm = () => {
    setSelected(null);
    setSearch('');
    setMode('set');
    setSetQuantity(1);
    setRows([]);
    setOrderNumber('');
  };

  const resetForm = () => {
    clearProductForm();
    setReason('');
    setReference('');
    setNotes('');
  };

  // ------- Cart -------------------------------------------------------------
  const addToCart = () => {
    if (!selected) return;
    if (allZero) {
      toast.error('Indique quantidade em pelo menos um coli');
      return;
    }
    if (requiresOrderNumber && !orderNumber.trim()) {
      toast.error('Número de encomenda obrigatório para esta categoria');
      return;
    }
    const item: CartItem = {
      key: `${selected.id}-${Date.now()}`,
      product: selected,
      rows: positiveRows.map(r => ({ ...r })),
      totalUnits,
      orderNumber: requiresOrderNumber ? orderNumber.trim() : null,
    };
    setCart(prev => [...prev, item]);
    toast.success(`${selected.name} adicionado ao carrinho (${totalUnits} un.)`);
    clearProductForm();
    setPickerOpen(true);
  };

  const removeFromCart = (key: string) => {
    setCart(prev => prev.filter(i => i.key !== key));
  };

  const cartUnits = cart.reduce((s, i) => s + i.totalUnits, 0);

  const commitItem = async (item: CartItem) => {
    const groups = new Map<string, ColiRow[]>();
    for (const r of item.rows) {
      const key = r.location || '';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }

    const effectiveReference = item.orderNumber ?? (reference.trim() || null);

    for (const [key, group] of groups.entries()) {
      const loc = key;
      const colis_quantities: Record<string, number> = {};
      for (const r of group) colis_quantities[String(r.colis_number)] = r.quantity;

      const { error } = await supabase.rpc('register_entry', {
        p_product_id: item.product.id,
        p_colis_quantities: colis_quantities,
        p_location: loc || null,
        p_reason: reason || null,
        p_reference: effectiveReference,
        p_notes: notes || null,
      });
      if (error) throw error;
    }
  };

  // ------- Submit -----------------------------------------------------------
  const buildPending = (): CartItem[] | null => {
    const pending: CartItem[] = [...cart];
    if (selected && !allZero) {
      if (requiresOrderNumber && !orderNumber.trim()) {
        toast.error('Número de encomenda obrigatório para esta categoria');
        return null;
      }
      pending.push({
        key: 'current',
        product: selected,
        rows: positiveRows.map(r => ({ ...r })),
        totalUnits,
        orderNumber: requiresOrderNumber ? orderNumber.trim() : null,
      });
    }
    if (pending.length === 0) {
      toast.error('Carrinho vazio');
      return null;
    }
    return pending;
  };

  const missingPlace = (items: CartItem[]) =>
    items.flatMap(i =>
      i.rows
        .filter(r => !r.location)
        .map(r => `${i.product.code} · Coli ${r.colis_number} (${r.quantity} un.)`)
    );

  const handleSubmit = () => {
    const pending = buildPending();
    if (!pending) return;
    const missing = missingPlace(pending);
    if (missing.length > 0) {
      setMissingWarning({ items: pending, missing });
      return;
    }
    void runSubmit(pending);
  };

  const runSubmit = async (pending: CartItem[]) => {
    setSubmitting(true);
    const failed: string[] = [];
    let okItems = 0;
    let okUnits = 0;
    try {
      for (const item of pending) {
        try {
          await commitItem(item);
          okItems += 1;
          okUnits += item.totalUnits;
          setCart(prev => prev.filter(i => i.key !== item.key));
        } catch (e) {
          console.error('register_entry failed', item.product.code, e);
          failed.push(item.product.code);
        }
      }

      if (okItems > 0) {
        toast.success(`Entrada registada: ${okItems} produto(s), ${okUnits} unidades`);
      }
      if (failed.length > 0) {
        toast.error(`Falha em: ${failed.join(', ')}`);
      }

      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['counts'] });
      queryClient.invalidateQueries({ queryKey: ['recent-movements'] });
      queryClient.invalidateQueries({ queryKey: ['unlocated-counts'] });

      if (failed.length === 0) resetForm();
      else clearProductForm();
    } finally {
      setSubmitting(false);
      setMissingWarning(null);
    }
  };




  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-green-600" />
          Entradas de Stock
        </h2>
        <p className="text-sm text-muted-foreground">
          Registe a entrada de produtos por coli ou importe diretamente de uma compra do Gestão Click.
        </p>
      </div>

      <Tabs defaultValue="manual" className="space-y-4">
        <TabsList>
          <TabsTrigger value="manual" className="gap-2">
            <Pencil className="h-4 w-4" /> Entrada manual
          </TabsTrigger>
          <TabsTrigger value="compra" className="gap-2">
            <ShoppingCart className="h-4 w-4" /> Por compra (Gestão Click)
          </TabsTrigger>
          <TabsTrigger value="historico" className="gap-2">
            <History className="h-4 w-4" /> Histórico de compras
          </TabsTrigger>
          <TabsTrigger value="sem-local" className="gap-2">
            <AlertTriangle className="h-4 w-4" /> Sem localização
          </TabsTrigger>
          <TabsTrigger value="movimentos" className="gap-2">
            <ClipboardList className="h-4 w-4" /> Movimentos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="compra" className="mt-0">
          <PurchaseEntryView />
        </TabsContent>

        <TabsContent value="sem-local" className="mt-0">
          <UnlocatedStockPanel />
        </TabsContent>

        <TabsContent value="movimentos" className="mt-0">
          <MovementHistoryView />
        </TabsContent>


        <TabsContent value="historico" className="mt-0">
          <PurchaseEntryHistory />
        </TabsContent>

        <TabsContent value="manual" className="mt-0">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Main column */}
        <div className="xl:col-span-2 space-y-4">
          {/* Product picker */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Search className="h-4 w-4" />
                Produto
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between">
                    {selected ? (
                      <span className="flex items-center gap-2 truncate">
                        <span className="font-mono text-xs text-muted-foreground">{selected.code}</span>
                        <span className="truncate">{selected.name}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Pesquisar por código ou nome…</span>
                    )}
                    <Search className="h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Pesquisar produto…"
                      value={search}
                      onValueChange={setSearch}
                    />
                    <CommandList>
                      <CommandEmpty>Sem resultados.</CommandEmpty>
                      <CommandGroup>
                        {filteredProducts.map(p => (
                          <CommandItem
                            key={p.id}
                            value={p.id}
                            onSelect={() => {
                              setSelected(p);
                              setPickerOpen(false);
                              setSearch('');
                            }}
                            className="flex flex-col items-start gap-0.5"
                          >
                            <div className="flex items-center gap-2 w-full">
                              <span className="font-mono text-xs">{p.code}</span>
                              <Badge variant="secondary" className="text-xs">
                                {p.total_colis} colis
                              </Badge>
                              <Badge variant="outline" className="text-xs ml-auto">
                                stock: {p.current_stock}
                              </Badge>
                            </div>
                            <span className="text-sm">{p.name}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              {selected && (
                <div className="mt-4 flex flex-wrap items-center gap-3 p-3 bg-muted/40 rounded-md">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{selected.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{selected.code}</p>
                  </div>
                  <Badge variant="secondary" className="gap-1">
                    <Package className="h-3 w-3" />
                    {effectiveTotalColis} colis
                  </Badge>
                  <Badge variant="outline">
                    Stock atual: {selected.current_stock} sets
                  </Badge>
                  {requiresOrderNumber && (
                    <Badge className="bg-amber-100 text-amber-800 border-amber-300 gap-1">
                      <ClipboardList className="h-3 w-3" />
                      Nº encomenda obrigatório
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={resetForm}
                    title="Limpar"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Entry form */}
          {selected && (
            <Card className="overflow-hidden">
              {/* Compact quick line */}
              <div className="flex items-center gap-3 p-3">
                <button
                  type="button"
                  className="flex-1 min-w-0 text-left"
                  onClick={() => setDetailsOpen(v => !v)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {detailsOpen
                      ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                    <span className="text-sm font-medium truncate">{selected.name}</span>
                    <Badge variant={mode === 'set' ? 'default' : 'secondary'} className="shrink-0 text-[10px]">
                      {mode === 'set' ? 'Set' : 'Avulso'}
                    </Badge>
                  </div>
                  <div className="pl-6 text-xs text-muted-foreground flex flex-wrap gap-x-2">
                    <span className="font-mono">{selected.code}</span>
                    <span>· {effectiveTotalColis} coli{effectiveTotalColis > 1 ? 's' : ''}</span>
                    <span>· {totalUnits} un.</span>
                    {rows.some(r => r.location) && (
                      <span className="truncate">
                        · {Array.from(new Set(rows.filter(r => r.quantity > 0 && r.location).map(r => r.location))).join(', ')}
                      </span>
                    )}
                  </div>
                </button>

                {mode === 'set' ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="icon" variant="outline" className="h-8 w-8"
                      onClick={() => setSetQuantity(q => Math.max(1, q - 1))}>
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <NumericInput
                      min={1}
                      value={setQuantity}
                      onChange={setSetQuantity}
                      className="w-16 h-8 text-center"
                    />
                    <Button size="icon" variant="outline" className="h-8 w-8"
                      onClick={() => setSetQuantity(q => q + 1)}>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <Badge variant="secondary" className="shrink-0">{totalUnits} un.</Badge>
                )}

                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 gap-1"
                  onClick={addToCart}
                  disabled={allZero || submitting}
                >
                  <ShoppingCart className="h-3.5 w-3.5" />
                  Adicionar
                </Button>
              </div>

              {detailsOpen && (
              <CardContent className="space-y-4 border-t pt-4">
                {/* Mode toggle */}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={mode === 'set' ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1 gap-2"
                    onClick={() => setMode('set')}
                  >
                    <Layers className="h-4 w-4" />
                    Set completo
                  </Button>
                  <Button
                    type="button"
                    variant={mode === 'individual' ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1 gap-2"
                    onClick={() => {
                      setMode('individual');
                      setRows(prev => prev.map(r => ({ ...r, quantity: 0 })));
                    }}
                  >
                    <Package className="h-4 w-4" />
                    Coli a coli
                  </Button>
                </div>

                {mode === 'set' && (
                  <div className="flex items-center gap-3">
                    <Label className="text-sm">Quantidade de sets:</Label>
                    <NumericInput
                      min={1}
                      value={setQuantity}
                      onChange={setSetQuantity}
                      className="w-24 h-9 text-center"
                    />
                    <span className="text-xs text-muted-foreground">
                      (replica em todos os colis — pode ajustar abaixo)
                    </span>
                  </div>
                )}

                {/* Coli rows */}
                <div className="border rounded-md divide-y">
                  {rows.map(r => {
                    const isSuggested =
                      r.suggested_location && r.location === r.suggested_location;
                    return (
                      <div
                        key={r.colis_number}
                        className="grid grid-cols-1 md:grid-cols-[80px_120px_1fr_auto] gap-2 items-center p-3"
                      >
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono">
                            Coli {r.colis_number}
                          </Badge>
                        </div>
                        <NumericInput
                          min={0}
                          value={r.quantity}
                          onChange={(v) => updateRow(r.colis_number, { quantity: v })}
                          className="h-9 text-center"
                        />
                        <LocationSelect
                          value={r.location}
                          onValueChange={(v) => updateRow(r.colis_number, { location: v })}
                          placeholder="Localização…"
                        />
                        <div className="text-xs">
                          {isSuggested ? (
                            <span className="text-green-700 flex items-center gap-1">
                              <Check className="h-3 w-3" /> sugerido
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {someZero && (
                  <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                    <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>
                      Esta entrada não forma set completo — os colis entram como avulso.
                      Pode prosseguir na mesma.
                    </span>
                  </div>
                )}
              </CardContent>
              )}
            </Card>
          )}

        </div>

        {/* Sidebar — meta + actions + recent */}
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <Label>Motivo</Label>
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger><SelectValue placeholder="Selecione um motivo…" /></SelectTrigger>
                  <SelectContent>
                    {ENTRY_REASONS.map(r => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {requiresOrderNumber ? (
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    Nº de encomenda
                    <span className="text-red-600">*</span>
                  </Label>
                  <Input
                    placeholder="Obrigatório para esta categoria"
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(e.target.value)}
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Referência (opcional)</Label>
                  <Input
                    placeholder="Ex: PO-2024-001, NF…"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                  />
                </div>
              )}

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
                  <span className="text-muted-foreground">Total de unidades:</span>
                  <span className="font-medium">{totalUnits}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Colis com entrada:</span>
                  <span className="font-medium">{positiveRows.length} / {rows.length}</span>
                </div>
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={addToCart}
                  disabled={!selected || allZero || submitting}
                >
                  <ShoppingCart className="h-4 w-4" />
                  Adicionar ao carrinho
                </Button>
                <Button
                  className="w-full bg-green-600 hover:bg-green-700"
                  onClick={handleSubmit}
                  disabled={submitting || (cart.length === 0 && (!selected || allZero))}
                >
                  {submitting
                    ? 'A registar…'
                    : cart.length > 0
                      ? `Confirmar ${cart.length + (selected && !allZero ? 1 : 0)} entrada(s) — ${cartUnits + (selected && !allZero ? totalUnits : 0)} un.`
                      : 'Confirmar entrada'}
                </Button>


              </div>
            </CardContent>
          </Card>

          {cart.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4" />
                  Carrinho de entradas
                  <Badge variant="secondary" className="ml-auto">{cartUnits} un.</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="max-h-[300px]">
                  <ul className="space-y-2 pr-3">
                    {cart.map(item => (
                      <li key={item.key} className="border-b last:border-0 pb-2">
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{item.product.name}</p>
                            <p className="text-xs text-muted-foreground font-mono">{item.product.code}</p>
                            <p className="text-xs text-muted-foreground">
                              {item.rows.map(r => `C${r.colis_number}: ${r.quantity}${r.location ? ` @${r.location}` : ''}`).join(' · ')}
                            </p>
                          </div>
                          <Badge variant="outline" className="text-xs">+{item.totalUnits}</Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => removeFromCart(item.key)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          <RecentMovementsPanel type="entrada" />

        </div>
          </div>
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!missingWarning} onOpenChange={(o) => !o && setMissingWarning(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Entrada sem localização
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Estes colis vão entrar sem localização nem palete e não aparecerão nas vistas de armazém:
                </p>
                <ul className="text-xs list-disc pl-5 max-h-40 overflow-auto">
                  {missingWarning?.missing.map(m => <li key={m}>{m}</li>)}
                </ul>
                <p>Pode corrigir depois no separador "Sem localização".</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Voltar e indicar local</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (missingWarning) void runSubmit(missingWarning.items);
              }}
              disabled={submitting}
            >
              {submitting ? 'A registar…' : 'Registar mesmo assim'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

