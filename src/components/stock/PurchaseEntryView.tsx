import { useState, useMemo, useCallback } from 'react';
import { ShoppingCart, Search, Loader2, CheckCircle2, AlertCircle, Plus, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { NumericInput } from '@/components/ui/numeric-input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { LocationSelect } from '@/components/counting/LocationSelect';
import { ProductForm } from '@/components/products/ProductForm';
import { useProducts } from '@/hooks/useProducts';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { GcCompraDetailResponse, GcCompraHeader, GcCompraItem } from '@/types/purchases';
import type { Product } from '@/types/stock';

const normalizeCode = (v: string) => v.trim().toLowerCase();
const normalizeName = (v: string) =>
  (v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();


interface RowState {
  key: string;
  item: GcCompraItem;
  qtyEntry: number;
  selected: boolean;
}

export function PurchaseEntryView() {
  const queryClient = useQueryClient();
  const { products, createProduct } = useProducts();

  const [numero, setNumero] = useState('');
  const [loading, setLoading] = useState(false);
  const [compra, setCompra] = useState<GcCompraHeader | null>(null);
  const [rows, setRows] = useState<RowState[]>([]);
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  // units already entered for this purchase, per product id
  const [enteredUnits, setEnteredUnits] = useState<Record<string, number>>({});

  const [quickOpen, setQuickOpen] = useState(false);
  const [quickCode, setQuickCode] = useState('');
  const [quickName, setQuickName] = useState('');

  const [locOpen, setLocOpen] = useState(false);
  const [location, setLocation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);


  const productByCode = useMemo(() => {
    const m = new Map<string, Product>();
    for (const p of products) m.set(normalizeCode(p.code), p);
    return m;
  }, [products]);

  // Fallback: when the ERP item comes without a code, match by product name.
  const productByName = useMemo(() => {
    const m = new Map<string, Product>();
    for (const p of products) {
      const k = normalizeName(p.name);
      if (k && !m.has(k)) m.set(k, p);
    }
    return m;
  }, [products]);

  const resolveProduct = useCallback((item: GcCompraItem): Product | undefined => {
    if (item.codigo) {
      const byCode = productByCode.get(normalizeCode(item.codigo));
      if (byCode) return byCode;
    }
    return productByName.get(normalizeName(item.nome));
  }, [productByCode, productByName]);

  // Fetch how much was already entered for this purchase (non-reversed entries)
  const fetchEntered = useCallback(async (compraNumero: string) => {
    const marker = `Compra GC #${compraNumero}`;
    const { data, error } = await supabase
      .from('stock_movements')
      .select('product_id, quantity, reversed_at')
      .eq('movement_type', 'entrada')
      .ilike('reference', `%${marker}%`);
    if (error) return {} as Record<string, number>;
    const map: Record<string, number> = {};
    for (const m of data || []) {
      if (m.reversed_at) continue;
      map[m.product_id] = (map[m.product_id] || 0) + (m.quantity || 0);
    }
    setEnteredUnits(map);
    setDuplicateWarning(Object.keys(map).length > 0);
    return map;
  }, []);

  const carregar = async () => {
    const n = numero.trim();
    if (!n) {
      toast.error('Introduza o número da compra');
      return;
    }
    setLoading(true);
    setCompra(null);
    setRows([]);
    setDuplicateWarning(false);
    setEnteredUnits({});
    try {
      const { data, error } = await supabase.functions.invoke<GcCompraDetailResponse>(
        'gestaoclick-compra-detail',
        { body: { numero: n } },
      );
      if (error) throw error;
      if (!data?.compra) throw new Error('Resposta inválida do Gestão Click');

      setCompra(data.compra);

      const entered = await fetchEntered(data.compra.numero);

      const initialRows: RowState[] = (data.itens || []).map((it, idx) => {
        const match = resolveProduct(it);
        const comprado = Math.max(0, Math.min(9999, Math.round(it.quantidade || 0)));
        const totalColis = Math.max(1, match?.total_colis || 1);
        const jaSets = match ? Math.round((entered[match.id] || 0) / totalColis) : 0;
        const restante = Math.max(0, comprado - jaSets);
        return {
          key: `${it.codigo || normalizeName(it.nome) || 'sem-codigo'}-${idx}`,
          item: { ...it, codigo: it.codigo || match?.code || '' },
          qtyEntry: restante,
          selected: !!match && restante > 0,
        };
      });

      setRows(initialRows);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao carregar compra';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // Sets already entered for a row
  const enteredSets = useCallback((item: GcCompraItem) => {
    const p = resolveProduct(item);
    if (!p) return 0;
    const totalColis = Math.max(1, p.total_colis || 1);
    return Math.round((enteredUnits[p.id] || 0) / totalColis);
  }, [resolveProduct, enteredUnits]);


  const setRow = (key: string, patch: Partial<RowState>) => {
    setRows(prev => prev.map(r => r.key === key ? { ...r, ...patch } : r));
  };

  const allRegisteredSelected = useMemo(() => {
    const registeredRows = rows.filter(r => !!resolveProduct(r.item) && enteredSets(r.item) < r.item.quantidade);
    if (registeredRows.length === 0) return false;
    return registeredRows.every(r => r.selected);
  }, [rows, resolveProduct, enteredSets]);

  const toggleAll = (checked: boolean) => {
    setRows(prev => prev.map(r =>
      (resolveProduct(r.item) && enteredSets(r.item) < r.item.quantidade) ? { ...r, selected: checked } : r
    ));

  };


  const openQuickRegister = (item: GcCompraItem) => {
    setQuickCode(item.codigo);
    setQuickName(item.nome);
    setQuickOpen(true);
  };

  const [bulkRegistering, setBulkRegistering] = useState(false);

  const registarTodosEmFalta = async () => {
    const missing = rows.filter(r => !resolveProduct(r.item) && r.item.codigo && r.item.nome);
    if (missing.length === 0) return;
    setBulkRegistering(true);
    let ok = 0;
    const failed: string[] = [];
    for (const r of missing) {
      const res = await createProduct({
        code: r.item.codigo,
        name: r.item.nome,
        category: 'Geral',
        total_colis: 1,
        description: null,
      });
      if (res) ok++;
      else failed.push(r.item.codigo);
    }
    setBulkRegistering(false);
    if (ok > 0) {
      toast.success(`${ok} produto(s) cadastrado(s)`);
      setTimeout(() => setRows(prev => prev.map(r => (
        enteredSets(r.item) >= r.item.quantidade ? r : { ...r, selected: true }
      ))), 300);

    }
    if (failed.length) toast.error(`Falha ao cadastrar: ${failed.join(', ')}`);
  };


  const selectedRows = rows.filter(r =>
    r.selected && !!resolveProduct(r.item) && r.qtyEntry > 0 && enteredSets(r.item) < r.item.quantidade
  );


  const iniciarEntrada = () => {
    if (!compra) return;
    if (selectedRows.length === 0) {
      toast.error('Nenhum item selecionado com quantidade válida');
      return;
    }
    const invalid = selectedRows.find(r => r.qtyEntry <= 0 || r.qtyEntry > 9999);
    if (invalid) {
      toast.error('Quantidade inválida — deve estar entre 1 e 9999');
      return;
    }
    setLocOpen(true);
  };

  const confirmarEntrada = async () => {
    if (!compra) return;
    setLocOpen(false);
    setSubmitting(true);
    setProgress({ done: 0, total: selectedRows.length });

    const failed: { code: string; name: string; reason: string }[] = [];
    let ok = 0;
    const refText = `Compra GC #${compra.numero}${compra.fornecedor_nome ? ' — ' + compra.fornecedor_nome : ''}`;

    for (let i = 0; i < selectedRows.length; i++) {
      const r = selectedRows[i];
      const product = resolveProduct(r.item);
      if (!product) {
        failed.push({ code: r.item.codigo, name: r.item.nome, reason: 'Produto local não encontrado' });
        setProgress({ done: i + 1, total: selectedRows.length });
        continue;
      }
      // Distribute qtyEntry across all colis (1..total_colis) evenly? Spec says qty to enter — treat as sets.
      // Use "set complete" semantics: same quantity for every coli.
      const totalColis = Math.max(1, product.total_colis || 1);
      const colisQty: Record<string, number> = {};
      for (let c = 1; c <= totalColis; c++) colisQty[String(c)] = r.qtyEntry;

      try {
        const { error } = await supabase.rpc('register_entry', {
          p_product_id: product.id,
          p_colis_quantities: colisQty,
          p_location: location || null,
          p_reason: 'Compra',
          p_reference: refText,
          p_notes: `Item Gestão Click: ${r.item.nome}`,
        });
        if (error) throw error;
        ok += 1;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Erro desconhecido';
        failed.push({ code: r.item.codigo, name: r.item.nome, reason: msg });
      }
      setProgress({ done: i + 1, total: selectedRows.length });
    }

    setSubmitting(false);
    setProgress(null);

    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({ queryKey: ['counts'] });
    queryClient.invalidateQueries({ queryKey: ['recent-entries'] });
    queryClient.invalidateQueries({ queryKey: ['stock-movements'] });

    if (failed.length === 0) {
      toast.success(`${ok} itens registados com sucesso`);
    } else {
      toast.error(
        `${ok} registados, ${failed.length} falharam: ` +
        failed.slice(0, 3).map(f => f.code || f.name).join(', ') +
        (failed.length > 3 ? '…' : '')
      );
      console.warn('Falhas na entrada por compra:', failed);
    }

    // Refresh what has already been entered for this purchase
    if (ok > 0) {
      const entered = await fetchEntered(compra.numero);
      setRows(prev => prev.map(r => {
        const p = resolveProduct(r.item);
        if (!p) return r;
        const totalColis = Math.max(1, p.total_colis || 1);
        const jaSets = Math.round((entered[p.id] || 0) / totalColis);
        const restante = Math.max(0, Math.round(r.item.quantidade || 0) - jaSets);
        return { ...r, qtyEntry: restante, selected: restante > 0 ? r.selected : false };
      }));
    }
  };


  const registeredCount = rows.filter(r => !!resolveProduct(r.item)).length;
  const missingCount = rows.length - registeredCount;
  const doneCount = rows.filter(r => !!resolveProduct(r.item) && enteredSets(r.item) >= r.item.quantidade).length;
  const pendingCount = rows.filter(r => !!resolveProduct(r.item) && enteredSets(r.item) < r.item.quantidade).length;


  return (
    <div className="space-y-4">
      {/* Search box */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" />
            Entrada por Compra do Gestão Click
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              placeholder="Nº da compra (ex: 12345)"
              value={numero}
              onChange={e => setNumero(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') carregar(); }}
              disabled={loading}
              className="flex-1"
            />
            <Button onClick={carregar} disabled={loading || !numero.trim()} className="sm:w-auto">
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
              Carregar Compra
            </Button>
          </div>
        </CardContent>
      </Card>

      {compra && (
        <>
          {/* Header */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="secondary" className="font-mono">#{compra.numero}</Badge>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{compra.fornecedor_nome || 'Fornecedor desconhecido'}</p>
                  <p className="text-xs text-muted-foreground">
                    {compra.data ? new Date(compra.data).toLocaleDateString('pt-PT') : '—'}
                    {compra.situacao ? ` · ${compra.situacao}` : ''}
                    {compra.valor_total !== null ? ` · ${compra.valor_total.toFixed(2)} €` : ''}
                  </p>
                </div>
                <Badge variant="outline">{rows.length} itens</Badge>
                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">
                  {registeredCount} registados
                </Badge>
                {missingCount > 0 && (
                  <>
                    <Badge className="bg-amber-100 text-amber-800 border-amber-300">
                      {missingCount} sem registo
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      disabled={bulkRegistering}
                      onClick={registarTodosEmFalta}
                    >
                      {bulkRegistering ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                      Cadastrar todos em falta
                    </Button>
                  </>
                )}
                {doneCount > 0 && (
                  <Badge className="bg-blue-100 text-blue-800 border-blue-300">
                    {doneCount} já com entrada
                  </Badge>
                )}
                <Badge variant="outline">{pendingCount} por dar entrada</Badge>
              </div>

              {duplicateWarning && (
                <Alert className="mt-4 border-amber-300 bg-amber-50 text-amber-900">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Esta compra já tem entradas registadas. Os itens já dados entrada estão marcados
                    e bloqueados; apenas as quantidades em falta serão registadas.
                  </AlertDescription>
                </Alert>
              )}

            </CardContent>
          </Card>

          {/* Items */}
          <Card>
            <CardContent className="pt-6">
              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                {rows.map(r => {
                  const exists = !!resolveProduct(r.item);
                  const ja = enteredSets(r.item);
                  const completo = exists && ja >= r.item.quantidade;
                  return (
                    <div key={r.key} className={`border rounded-lg p-3 space-y-2 ${completo ? 'opacity-70 bg-muted/40' : ''}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-mono text-xs text-muted-foreground">{r.item.codigo || '—'}</p>
                          <p className="text-sm font-medium truncate">{r.item.nome}</p>
                        </div>
                        {!exists ? (
                          <Badge variant="destructive" className="gap-1 shrink-0">
                            <AlertCircle className="h-3 w-3" /> Sem registo
                          </Badge>
                        ) : completo ? (
                          <Badge className="bg-blue-100 text-blue-800 border-blue-300 gap-1 shrink-0">
                            <CheckCircle2 className="h-3 w-3" /> Entrada feita
                          </Badge>
                        ) : (
                          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 gap-1 shrink-0">
                            <CheckCircle2 className="h-3 w-3" /> Registado
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground">Comprado:</span>
                        <span className="text-sm">{r.item.quantidade}</span>
                        <span className="text-xs text-muted-foreground ml-2">Já entrada:</span>
                        <span className="text-sm">{ja}</span>
                        <span className="text-xs text-muted-foreground ml-2">Entrada:</span>
                        <NumericInput
                          min={0}
                          max={9999}
                          value={r.qtyEntry}
                          onChange={v => setRow(r.key, { qtyEntry: v })}
                          className="h-9 w-24 text-center"
                          disabled={completo}
                        />
                      </div>
                      {exists ? (
                        <label className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={r.selected && !completo}
                            disabled={completo}
                            onCheckedChange={v => setRow(r.key, { selected: v === true })}
                          />
                          {completo ? 'Já dado entrada nesta compra' : 'Incluir na entrada'}
                        </label>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => openQuickRegister(r.item)} className="w-full gap-1">
                          <Plus className="h-3 w-3" /> Cadastrar
                        </Button>
                      )}
                    </div>
                  );
                })}

              </div>

              {/* Desktop table */}
              <div className="hidden max-h-[520px] overflow-auto md:block">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-card">
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox
                            checked={allRegisteredSelected}
                            onCheckedChange={v => toggleAll(v === true)}
                            aria-label="Selecionar todos"
                          />
                        </TableHead>
                        <TableHead>Código</TableHead>
                        <TableHead>Nome</TableHead>
                        <TableHead className="text-right w-24">Comprado</TableHead>
                        <TableHead className="text-right w-24">Já entrada</TableHead>
                        <TableHead className="w-32">Qtd. entrada</TableHead>
                        <TableHead className="w-40">Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map(r => {
                        const exists = !!resolveProduct(r.item);
                        const ja = enteredSets(r.item);
                        const completo = exists && ja >= r.item.quantidade;
                        return (
                          <TableRow key={r.key} className={completo ? 'opacity-70 bg-muted/40' : ''}>
                            <TableCell>
                              <Checkbox
                                checked={r.selected && !completo}
                                disabled={!exists || completo}
                                onCheckedChange={v => setRow(r.key, { selected: v === true })}
                              />
                            </TableCell>
                            <TableCell className="font-mono text-xs">{r.item.codigo || '—'}</TableCell>
                            <TableCell className="max-w-[380px] truncate">{r.item.nome}</TableCell>
                            <TableCell className="text-right">{r.item.quantidade}</TableCell>
                            <TableCell className="text-right">{ja}</TableCell>
                            <TableCell>
                              <NumericInput
                                min={0}
                                max={9999}
                                value={r.qtyEntry}
                                onChange={v => setRow(r.key, { qtyEntry: v })}
                                className="h-9 text-center"
                                disabled={completo}
                              />
                            </TableCell>
                            <TableCell>
                              {!exists ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openQuickRegister(r.item)}
                                  className="gap-1 h-7"
                                >
                                  <Plus className="h-3 w-3" /> Cadastrar
                                </Button>
                              ) : completo ? (
                                <Badge className="bg-blue-100 text-blue-800 border-blue-300 gap-1">
                                  <CheckCircle2 className="h-3 w-3" /> Entrada feita
                                </Badge>
                              ) : (
                                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 gap-1">
                                  <CheckCircle2 className="h-3 w-3" /> Registado
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}

                    </TableBody>
                  </Table>
              </div>
            </CardContent>
          </Card>

          {/* Action bar */}
          <Card>
            <CardContent className="pt-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="flex-1 text-sm text-muted-foreground">
                {selectedRows.length} itens selecionados ·{' '}
                {selectedRows.reduce((s, r) => s + r.qtyEntry, 0)} unidades totais
                {progress && (
                  <span className="ml-2">
                    · A registar {progress.done}/{progress.total}…
                  </span>
                )}
              </div>
              <Button
                onClick={iniciarEntrada}
                disabled={submitting || selectedRows.length === 0}
                className="bg-green-600 hover:bg-green-700 gap-2"
                size="lg"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
                Dar entrada nos selecionados
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      {/* Location dialog */}
      <Dialog open={locOpen} onOpenChange={setLocOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Localização da entrada</DialogTitle>
            <DialogDescription>
              Escolha a localização a aplicar a todos os itens selecionados.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <LocationSelect
              value={location}
              onValueChange={setLocation}
              placeholder="Localização (opcional)…"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLocOpen(false)}>Cancelar</Button>
            <Button onClick={confirmarEntrada} className="bg-green-600 hover:bg-green-700">
              Confirmar entrada
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick product register — reuses ProductForm controlled */}
      <ProductForm
        onSubmit={async (payload) => {
          const res = await createProduct(payload);
          return !!res;
        }}
        open={quickOpen}
        onOpenChange={setQuickOpen}
        initialCode={quickCode}
        initialName={quickName}
        lockCode={!!quickCode}
        hideTrigger
        onCreated={() => {
          // Force reselect the row now that product exists (products list will refresh via react-query)
          setTimeout(() => {
            setRows(prev => prev.map(r => {
              const sameCode = !!quickCode && r.item.codigo === quickCode;
              const sameName = normalizeName(r.item.nome) === normalizeName(quickName);
              if (sameCode || sameName) return { ...r, selected: true };
              return r;
            }));
          }, 50);
        }}

      />
    </div>
  );
}
