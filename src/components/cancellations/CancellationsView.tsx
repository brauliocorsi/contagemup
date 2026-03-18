import { useState, useMemo } from 'react';
import { Search, XCircle, ArrowRight, ShoppingCart, Package, Calendar, User, Loader2, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react';
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

export function CancellationsView() {
  const [searchCode, setSearchCode] = useState('');
  const [vendaDetail, setVendaDetail] = useState<VendaDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<TransferSuggestion[]>([]);
  const [expandedSuggestions, setExpandedSuggestions] = useState<Set<string>>(new Set());

  const { fetchSales, getSalesForProduct, salesMap, loaded: salesLoaded, loading: salesFetching } = useProductSales();

  const handleSearch = async () => {
    const code = searchCode.trim();
    if (!code) return;

    setLoading(true);
    setVendaDetail(null);
    setSuggestions([]);
    setSelectedTransfer(null);

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

      // Build lookup sets for the cancelled sale's products
      const cancelledProducts = vendaDetail.produtos.map(p => ({
        ...p,
        normalizedCode: normalize(p.codigo),
        normalizedName: normalizeName(p.nome),
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
            // Try matching by code first, then by name
            const matchingDestProduct = sale.produtos.find(sp => {
              const spCode = normalize(sp.codigo);
              const spName = normalizeName(sp.nome);
              // Match by code (if both non-empty)
              if (cancelledProd.normalizedCode && spCode && cancelledProd.normalizedCode === spCode) return true;
              // Match by name (if both non-empty and code didn't match)
              if (cancelledProd.normalizedName && spName && cancelledProd.normalizedName === spName) return true;
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
                mp => normalize(mp.codigo) === cancelledProd.normalizedCode ||
                      normalizeName(mp.nome) === cancelledProd.normalizedName
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left: Sale to cancel */}
          <Card className="border-destructive/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-destructive" />
                  Venda a Cancelar
                </span>
                <Badge variant="destructive">#{vendaDetail.codigo}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="truncate">{vendaDetail.cliente_nome || '—'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{vendaDetail.data || '—'}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="outline">{vendaDetail.situacao}</Badge>
                <span className="text-muted-foreground">€{parseFloat(vendaDetail.valor_total).toFixed(2)}</span>
              </div>

              <Separator />

              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                  <Package className="h-3 w-3" />
                  Produtos ({vendaDetail.produtos.length})
                </p>
                <div className="space-y-1">
                  {vendaDetail.produtos.map((p, i) => (
                    <div key={i} className="flex items-center justify-between text-sm py-1 px-2 rounded bg-muted/50">
                      <div className="min-w-0">
                        <span className="font-mono text-xs text-muted-foreground mr-2">{p.codigo}</span>
                        <span className="truncate">{p.nome}</span>
                      </div>
                      <Badge variant="secondary" className="shrink-0 text-xs">{p.quantidade} un.</Badge>
                    </div>
                  ))}
                </div>
              </div>

              <Button
                onClick={handleFindTransfers}
                disabled={suggestionsLoading || salesFetching}
                className="w-full gap-2 mt-2"
                variant="outline"
              >
                {suggestionsLoading || salesFetching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShoppingCart className="h-4 w-4" />
                )}
                Encontrar vendas para transferir
              </Button>
            </CardContent>
          </Card>

          {/* Right: Transfer suggestions */}
          <Card className="border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ArrowRight className="h-4 w-4 text-primary" />
                Sugestões de Transferência
                {suggestions.length > 0 && (
                  <Badge variant="secondary" className="text-xs">{suggestions.length}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {suggestions.length === 0 && !suggestionsLoading ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  {vendaDetail ? 'Clique em "Encontrar vendas" para ver sugestões' : 'Pesquise uma venda primeiro'}
                </p>
              ) : suggestionsLoading ? (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  A procurar vendas compatíveis...
                </div>
              ) : (
                <ScrollArea className="h-[500px]">
                  <div className="space-y-2 pr-3">
                    {suggestions.map((s) => {
                      const isExpanded = expandedSuggestions.has(s.venda.venda_id);
                      return (
                        <div
                          key={s.venda.venda_id}
                          className={`border rounded-lg transition-colors ${
                            isExpanded ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                          }`}
                        >
                          <button
                            onClick={() => {
                              setExpandedSuggestions(prev => {
                                const next = new Set(prev);
                                if (next.has(s.venda.venda_id)) {
                                  next.delete(s.venda.venda_id);
                                } else {
                                  next.add(s.venda.venda_id);
                                }
                                return next;
                              });
                            }}
                            className="w-full text-left p-3"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                {isExpanded ? (
                                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                )}
                                <span className="font-mono font-semibold text-sm">#{s.venda.codigo}</span>
                                <Badge variant="outline" className="text-[10px]">{s.venda.situacao}</Badge>
                              </div>
                              <Badge variant="secondary" className="text-xs gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                {s.matchCount} produto(s)
                              </Badge>
                            </div>
                            <div className="text-xs text-muted-foreground flex items-center gap-2 ml-5">
                              <span>{s.venda.cliente_nome}</span>
                              <span>•</span>
                              <span>{s.venda.data}</span>
                            </div>
                          </button>

                          {/* Collapsed products panel */}
                          {isExpanded && (
                            <div className="px-3 pb-3 pt-0 border-t mx-3 mt-1 space-y-1.5">
                              <p className="text-xs font-medium text-muted-foreground pt-2">Produtos transferíveis:</p>
                              {s.matchingProducts.map((mp) => (
                                <div key={mp.codigo} className="flex items-center justify-between text-xs p-1.5 rounded bg-primary/5 border border-primary/10">
                                  <div className="min-w-0">
                                    <span className="font-mono text-muted-foreground mr-1">{mp.codigo}</span>
                                    <span className="truncate">{mp.nome}</span>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <Badge variant="destructive" className="text-[10px] px-1 py-0">{mp.qtdOrigem}</Badge>
                                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                    <Badge className="text-[10px] px-1 py-0">{mp.qtdDestino}</Badge>
                                  </div>
                                </div>
                              ))}
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
  );
}
