import { useState, useMemo } from 'react';
import { Search, XCircle, ArrowRight, ShoppingCart, Package, Calendar, User, Loader2, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Trophy, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useProductSales, VendaInfo } from '@/hooks/useProductSales';
import { toast } from 'sonner';

interface VendaDetail {
  id: string;
  codigo: string;
  data: string;
  situacao: string;
  cliente_nome: string;
  valor_total: string;
  observacao: string;
  produtos: Array<{
    nome: string;
    codigo: string;
    quantidade: string;
    valor_unitario: string;
  }>;
}

interface TransferSuggestion {
  venda: VendaInfo;
  matchingProducts: Array<{
    codigo: string;
    nome: string;
    qtdOrigem: number;
    qtdDestino: number;
  }>;
  matchCount: number;
}

interface ProductSuggestion {
  productKey: string;
  codigo: string;
  nome: string;
  qtdOrigem: number;
  vendas: Array<{
    venda_id: string;
    codigo: string;
    cliente_nome: string;
    situacao: string;
    data: string;
    qtdDestino: number;
  }>;
}

export function CancellationsView() {
  const [searchCode, setSearchCode] = useState('');
  const [vendaDetail, setVendaDetail] = useState<VendaDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<TransferSuggestion[]>([]);
  const [expandedSuggestions, setExpandedSuggestions] = useState<Set<string>>(new Set());

  const { fetchSales, getSalesForProduct, salesMap, loaded: salesLoaded, loading: salesFetching } = useProductSales();

  // Transform sale-based suggestions into product-based groupings, including products without matches
  const productSuggestions = useMemo<ProductSuggestion[]>(() => {
    if (!vendaDetail) return [];
    const productMap = new Map<string, ProductSuggestion>();
    const normalize = (s: string) => s.trim().toLowerCase();
    const normalizeName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
    const getProductKey = (code: string, name: string, fallback: string) => {
      const normalizedCode = normalize(code || '');
      const normalizedName = normalizeName(name || '');
      return normalizedCode || normalizedName || fallback;
    };

    // Initialize ALL products from the cancelled sale
    for (let i = 0; i < vendaDetail.produtos.length; i++) {
      const p = vendaDetail.produtos[i];
      const key = getProductKey(p.codigo, p.nome, `produto-${i}`);
      const qtdOrigem = parseInt(p.quantidade) || 0;

      if (!productMap.has(key)) {
        productMap.set(key, {
          productKey: key,
          codigo: p.codigo,
          nome: p.nome,
          qtdOrigem,
          vendas: [],
        });
      } else {
        productMap.get(key)!.qtdOrigem += qtdOrigem;
      }
    }

    // Fill in matched sales
    for (const s of suggestions) {
      for (const mp of s.matchingProducts) {
        const key = getProductKey(mp.codigo, mp.nome, `match-${mp.nome}`);
        if (!productMap.has(key)) {
          productMap.set(key, {
            productKey: key,
            codigo: mp.codigo,
            nome: mp.nome,
            qtdOrigem: mp.qtdOrigem,
            vendas: [],
          });
        }
        const existing = productMap.get(key)!;
        const alreadyHas = existing.vendas.some(v => v.venda_id === s.venda.venda_id);
        if (!alreadyHas) {
          existing.vendas.push({
            venda_id: s.venda.venda_id,
            codigo: s.venda.codigo,
            cliente_nome: s.venda.cliente_nome,
            situacao: s.venda.situacao,
            data: s.venda.data,
            qtdDestino: mp.qtdDestino,
          });
        }
      }
    }
    // Sort: products with matches first, then by number of matches desc
    return Array.from(productMap.values()).sort((a, b) => b.vendas.length - a.vendas.length);
  }, [suggestions, vendaDetail]);

  // Compute how many distinct products each destination sale covers
  const vendaCoverageMap = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    for (const ps of productSuggestions) {
      for (const v of ps.vendas) {
        map[v.venda_id] = (map[v.venda_id] || 0) + 1;
      }
    }
    return map;
  }, [productSuggestions]);

  const maxCoverage = useMemo(() => Math.max(0, ...Object.values(vendaCoverageMap)), [vendaCoverageMap]);
  const totalCancelledProducts = vendaDetail?.produtos.length || 0;

  // Best choices: top sales sorted by coverage, only those covering 2+ products
  const bestChoices = useMemo(() => {
    if (productSuggestions.length === 0) return [];
    const salesInfo = new Map<string, { venda_id: string; codigo: string; cliente_nome: string; situacao: string; data: string; coverage: number; produtos: string[] }>();
    for (const ps of productSuggestions) {
      for (const v of ps.vendas) {
        if (!salesInfo.has(v.venda_id)) {
          salesInfo.set(v.venda_id, {
            venda_id: v.venda_id,
            codigo: v.codigo,
            cliente_nome: v.cliente_nome,
            situacao: v.situacao,
            data: v.data,
            coverage: 0,
            produtos: [],
          });
        }
        const info = salesInfo.get(v.venda_id)!;
        info.coverage++;
        info.produtos.push(ps.nome);
      }
    }
    return Array.from(salesInfo.values())
      .filter(s => s.coverage >= 2)
      .sort((a, b) => b.coverage - a.coverage)
      .slice(0, 5);
  }, [productSuggestions]);

  const handleSearch = async () => {
    const code = searchCode.trim();
    if (!code) return;

    setLoading(true);
    setVendaDetail(null);
    setSuggestions([]);
    setExpandedSuggestions(new Set());

    try {
      // First try searching by venda_id directly
      const { data, error } = await supabase.functions.invoke('gestaoclick-venda-detail', {
        body: { venda_codigo: code },
      });

      if (error || data?.error) {
        toast.error('Venda não encontrada', { description: `Código: ${code}` });
        setLoading(false);
        return;
      }

      setVendaDetail(data as VendaDetail);
    } catch {
      toast.error('Erro ao buscar venda');
    } finally {
      setLoading(false);
    }
  };

  const handleFindTransfers = async () => {
    if (!vendaDetail) return;

    setSuggestionsLoading(true);
    try {
      // Ensure sales are loaded
      if (!salesLoaded) {
        await fetchSales();
      }

      const normalize = (s: string) => s.trim().toLowerCase();
      const normalizeName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
      const getProductKey = (code: string, name: string) => normalize(code || '') || normalizeName(name || '');

      // Build lookup sets for the cancelled sale's products
      const cancelledProducts = vendaDetail.produtos.map((p, index) => ({
        ...p,
        normalizedCode: normalize(p.codigo),
        normalizedName: normalizeName(p.nome),
        productKey: getProductKey(p.codigo, p.nome) || `produto-${index}`,
      }));

      const allSuggestions = new Map<string, TransferSuggestion>();

      // Iterate ALL sales in the map to find any that share products
      const allSalesEntries = Object.values(salesMap) as VendaInfo[][];
      const seenVendas = new Set<string>();

      for (const salesList of allSalesEntries) {
        for (const sale of salesList) {
          // Skip same sale
          if (sale.codigo === vendaDetail.codigo) continue;
          if (seenVendas.has(sale.venda_id)) {
            // Already processed this sale, but check for additional product matches
          }
          seenVendas.add(sale.venda_id);

          for (const cancelledProd of cancelledProducts) {
            const matchingDestProduct = sale.produtos.find(sp => {
              const spCode = normalize(sp.codigo);
              const spName = normalizeName(sp.nome);
              // Match by code (exact)
              if (cancelledProd.normalizedCode && spCode && cancelledProd.normalizedCode === spCode) return true;
              // Match by name (exact)
              if (cancelledProd.normalizedName && spName && cancelledProd.normalizedName === spName) return true;
              // Match by partial name (contains) - at least 5 chars to avoid false positives
              if (cancelledProd.normalizedName.length >= 5 && spName.length >= 5) {
                if (spName.includes(cancelledProd.normalizedName) || cancelledProd.normalizedName.includes(spName)) return true;
              }
              return false;
            });

            if (matchingDestProduct) {
              if (!allSuggestions.has(sale.venda_id)) {
                allSuggestions.set(sale.venda_id, {
                  venda: sale,
                  matchingProducts: [],
                  matchCount: 0,
                });
              }

              const suggestion = allSuggestions.get(sale.venda_id)!;
              const alreadyAdded = suggestion.matchingProducts.some(
                mp => getProductKey(mp.codigo, mp.nome) === cancelledProd.productKey
              );

              if (!alreadyAdded) {
                suggestion.matchingProducts.push({
                  codigo: cancelledProd.codigo,
                  nome: cancelledProd.nome,
                  qtdOrigem: parseInt(cancelledProd.quantidade) || 0,
                  qtdDestino: parseInt(matchingDestProduct.quantidade) || 0,
                });
                suggestion.matchCount++;
              }
            }
          }
        }
      }

      // Sort by match count (desc) then date (oldest first)
      const sorted = Array.from(allSuggestions.values()).sort((a, b) => {
        if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount;
        return (a.venda.data || '').localeCompare(b.venda.data || '');
      });

      setSuggestions(sorted);
      console.log(`Found ${sorted.length} transfer suggestions from ${seenVendas.size} sales scanned`);

      if (sorted.length === 0) {
        toast.info('Nenhuma venda em aberto encontrada com os mesmos produtos');
      }
    } catch {
      toast.error('Erro ao buscar sugestões');
    } finally {
      setSuggestionsLoading(false);
    }
  };

  const handleClear = () => {
    setSearchCode('');
    setVendaDetail(null);
    setSuggestions([]);
    setExpandedSuggestions(new Set());
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <XCircle className="h-6 w-6 text-destructive" />
          Cancelamentos e Transferências
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Pesquise uma venda para cancelar e veja para quais vendas em aberto pode transferir os produtos.
        </p>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex gap-2">
            <Input
              placeholder="Código da venda (ex: 12345)..."
              value={searchCode}
              onChange={(e) => setSearchCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="max-w-xs"
            />
            <Button onClick={handleSearch} disabled={loading || !searchCode.trim()} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Pesquisar
            </Button>
            {vendaDetail && (
              <Button variant="outline" onClick={handleClear} size="sm">Limpar</Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Sale Detail */}
      {vendaDetail && (
        <div className="space-y-4">
          {/* Top: Cancelled sale info */}
          <Card className="border-destructive/30">
            <CardContent className="pt-4">
              <div className="flex flex-col md:flex-row md:items-start gap-4">
                <div className="flex items-center gap-2 shrink-0">
                  <XCircle className="h-5 w-5 text-destructive" />
                  <span className="font-semibold">Venda a Cancelar</span>
                  <Badge variant="destructive">#{vendaDetail.codigo}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    {vendaDetail.cliente_nome || '—'}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    {vendaDetail.data || '—'}
                  </span>
                  <Badge variant="outline">{vendaDetail.situacao}</Badge>
                  <span className="text-muted-foreground">€{parseFloat(vendaDetail.valor_total).toFixed(2)}</span>
                </div>
                <div className="md:ml-auto shrink-0">
                  <Button
                    onClick={handleFindTransfers}
                    disabled={suggestionsLoading || salesFetching}
                    className="gap-2"
                    variant="outline"
                    size="sm"
                  >
                    {suggestionsLoading || salesFetching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ShoppingCart className="h-4 w-4" />
                    )}
                    Encontrar vendas
                  </Button>
                </div>
              </div>

              <Separator className="my-3" />

              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                  <Package className="h-3 w-3" />
                  Produtos ({vendaDetail.produtos.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {vendaDetail.produtos.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm py-1 px-2.5 rounded-md bg-muted/50 border">
                      <span className="font-mono text-xs text-muted-foreground">{p.codigo}</span>
                      <span className="truncate max-w-[200px]">{p.nome}</span>
                      <Badge variant="secondary" className="text-xs shrink-0">{p.quantidade} un.</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Best Choices + Suggestions side by side */}
          {(productSuggestions.length > 0 || suggestionsLoading) && (
            <div className={`grid grid-cols-1 gap-4 ${bestChoices.length > 0 ? 'lg:grid-cols-3' : ''}`}>
              {/* Best choices */}
              {bestChoices.length > 0 && (
                <Card className="border-yellow-500/40 bg-yellow-50/30 dark:bg-yellow-950/10">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Trophy className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                      Melhores Escolhas
                      <Badge className="text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700" variant="outline">
                        Top {bestChoices.length}
                      </Badge>
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">Vendas que cobrem mais produtos</p>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {bestChoices.map((choice, idx) => (
                        <div
                          key={choice.venda_id}
                          className={`p-3 rounded-lg border transition-colors ${
                            idx === 0
                              ? 'bg-yellow-100/60 dark:bg-yellow-900/20 border-yellow-400/60 dark:border-yellow-600/40 ring-1 ring-yellow-400/30'
                              : 'bg-background border-border hover:bg-muted/50'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              {idx === 0 && <Star className="h-4 w-4 text-yellow-600 dark:text-yellow-400 fill-yellow-500/50" />}
                              <span className={`font-mono font-bold text-sm ${idx === 0 ? 'text-yellow-800 dark:text-yellow-300' : ''}`}>
                                #{choice.codigo}
                              </span>
                              <Badge variant="outline" className="text-[10px]">{choice.situacao}</Badge>
                            </div>
                            <Badge className={`text-xs gap-1 ${
                              idx === 0 ? 'bg-yellow-600 hover:bg-yellow-700 text-white' : ''
                            }`}>
                              <Package className="h-3 w-3" />
                              {choice.coverage}/{totalCancelledProducts} prod.
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground truncate flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {choice.cliente_nome}
                            </span>
                            <span className="text-muted-foreground flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {choice.data}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {choice.produtos.map((nome, pi) => (
                              <span key={pi} className="text-[10px] bg-muted px-1.5 py-0.5 rounded truncate max-w-[150px]">
                                {nome}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Transfer suggestions grouped by product */}
              <Card className={`border-primary/20 ${bestChoices.length > 0 ? 'lg:col-span-2' : ''}`}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ArrowRight className="h-4 w-4 text-primary" />
                    Sugestões de Transferência
                    {productSuggestions.length > 0 && (
                      <Badge variant="secondary" className="text-xs">{productSuggestions.length} produto(s)</Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {suggestionsLoading ? (
                    <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      A procurar vendas compatíveis...
                    </div>
                  ) : (
                    <ScrollArea className="h-[500px]">
                      <div className="space-y-3 pr-3">
                        {productSuggestions.map((ps) => {
                          const isExpanded = expandedSuggestions.has(ps.productKey);
                          return (
                            <div key={ps.productKey} className={`border rounded-lg overflow-hidden ${ps.vendas.length === 0 ? 'opacity-60' : ''}`}>
                              <button
                                onClick={() => {
                                  if (ps.vendas.length === 0) return;
                                  setExpandedSuggestions(prev => {
                                    const next = new Set(prev);
                                    next.has(ps.productKey) ? next.delete(ps.productKey) : next.add(ps.productKey);
                                    return next;
                                  });
                                }}
                                className={`w-full text-left p-3 transition-colors ${
                                  ps.vendas.length === 0 ? 'cursor-default' : isExpanded ? 'bg-primary/5' : 'hover:bg-muted/50'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2 min-w-0">
                                    {ps.vendas.length > 0 ? (
                                      isExpanded ? (
                                        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                                      ) : (
                                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                                      )
                                    ) : (
                                      <AlertTriangle className="h-4 w-4 text-muted-foreground shrink-0" />
                                    )}
                                    <Package className="h-4 w-4 text-primary shrink-0" />
                                    <span className="font-medium text-sm truncate">{ps.nome}</span>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <Badge variant="destructive" className="text-xs">{ps.qtdOrigem} un.</Badge>
                                    {ps.vendas.length > 0 ? (
                                      <Badge variant="secondary" className="text-xs gap-1">
                                        <ShoppingCart className="h-3 w-3" />
                                        {ps.vendas.length} venda(s)
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-xs text-muted-foreground">Sem correspondência</Badge>
                                    )}
                                  </div>
                                </div>
                                <div className="text-xs text-muted-foreground ml-8 mt-1">
                                  Código: <span className="font-mono">{ps.codigo}</span>
                                </div>
                              </button>

                              {isExpanded && ps.vendas.length > 0 && (
                                <div className="border-t bg-muted/20 p-2 space-y-1.5">
                                  {[...ps.vendas].sort((a, b) => (vendaCoverageMap[b.venda_id] || 0) - (vendaCoverageMap[a.venda_id] || 0)).map((v) => {
                                    const coverage = vendaCoverageMap[v.venda_id] || 0;
                                    const isBestMatch = coverage === maxCoverage && maxCoverage > 1;
                                    const isGoodMatch = coverage > 1;
                                    return (
                                      <div
                                        key={v.venda_id}
                                        className={`flex items-center justify-between p-2 rounded-md border text-xs transition-colors ${
                                          isBestMatch
                                            ? 'bg-primary/10 border-primary/40 ring-1 ring-primary/20'
                                            : isGoodMatch
                                            ? 'bg-accent/50 border-accent'
                                            : 'bg-background'
                                        }`}
                                      >
                                        <div className="flex items-center gap-3 min-w-0">
                                          {isBestMatch && <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />}
                                          <span className={`font-mono font-semibold text-sm ${isBestMatch ? 'text-primary' : ''}`}>#{v.codigo}</span>
                                          <Badge variant="outline" className="text-[10px] shrink-0">{v.situacao}</Badge>
                                          <span className="text-muted-foreground truncate">{v.cliente_nome}</span>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                          {coverage > 1 && (
                                            <Badge variant={isBestMatch ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0 gap-1">
                                              <Package className="h-3 w-3" />
                                              {coverage}/{totalCancelledProducts} prod.
                                            </Badge>
                                          )}
                                          <span className="text-muted-foreground">{v.data}</span>
                                          <Badge className="text-[10px] px-1.5 py-0">{v.qtdDestino} un.</Badge>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
