import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, Search, AlertTriangle, Clock, CheckCircle2, Phone, MapPin, Package, ChevronDown, ChevronUp } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';

interface VendaProduto {
  nome: string;
  codigo: string;
  quantidade: string;
  valor_unitario: string;
}

interface VendaPendente {
  venda_id: string;
  codigo: string;
  data: string;
  situacao: string;
  cliente_nome: string;
  cliente_telefone: string;
  cliente_email: string;
  endereco: string;
  cidade: string;
  estado: string;
  cep: string;
  valor_total: string;
  observacao: string;
  produtos: VendaProduto[];
}

type DelayStatus = 'atrasado' | 'proximo' | 'andamento';

function getDelayStatus(dataVenda: string): { status: DelayStatus; days: number } {
  if (!dataVenda) return { status: 'andamento', days: 0 };
  
  const parts = dataVenda.split('/');
  let vendaDate: Date;
  
  if (parts.length === 3) {
    // DD/MM/YYYY format
    vendaDate = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
  } else {
    vendaDate = new Date(dataVenda);
  }
  
  if (isNaN(vendaDate.getTime())) return { status: 'andamento', days: 0 };
  
  const now = new Date();
  const diffMs = now.getTime() - vendaDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays >= 30) return { status: 'atrasado', days: diffDays };
  if (diffDays >= 25) return { status: 'proximo', days: diffDays };
  return { status: 'andamento', days: diffDays };
}

function DelayBadge({ status, days }: { status: DelayStatus; days: number }) {
  if (status === 'atrasado') {
    return (
      <Badge variant="destructive" className="gap-1 font-semibold">
        <AlertTriangle className="h-3 w-3" />
        Atrasado ({days} dias)
      </Badge>
    );
  }
  if (status === 'proximo') {
    return (
      <Badge className="gap-1 font-semibold bg-amber-500 hover:bg-amber-600 text-white">
        <Clock className="h-3 w-3" />
        Próximo de atrasar ({days} dias)
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <CheckCircle2 className="h-3 w-3" />
      Em andamento ({days} dias)
    </Badge>
  );
}

export function PendingSalesView() {
  const [vendas, setVendas] = useState<VendaPendente[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const fetchVendas = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('gestaoclick-vendas-pendentes');
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setVendas(data?.vendas || []);
      toast({ title: `${data?.total || 0} vendas pendentes carregadas` });
    } catch (err: any) {
      console.error('Error fetching pending sales:', err);
      setError(err.message || 'Erro ao buscar vendas pendentes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVendas();
  }, [fetchVendas]);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const vendasWithDelay = useMemo(() => {
    return vendas.map(v => ({
      ...v,
      delay: getDelayStatus(v.data),
    }));
  }, [vendas]);

  const filtered = useMemo(() => {
    let result = vendasWithDelay;

    if (filterStatus !== 'all') {
      result = result.filter(v => v.delay.status === filterStatus);
    }

    if (search.trim()) {
      const term = search.toLowerCase();
      result = result.filter(v =>
        v.codigo.toLowerCase().includes(term) ||
        v.cliente_nome.toLowerCase().includes(term) ||
        v.cliente_telefone.includes(term) ||
        v.situacao.toLowerCase().includes(term) ||
        v.produtos.some(p => p.nome.toLowerCase().includes(term) || p.codigo.toLowerCase().includes(term))
      );
    }

    // Sort: atrasado first, then proximo, then andamento
    const order: Record<DelayStatus, number> = { atrasado: 0, proximo: 1, andamento: 2 };
    result.sort((a, b) => order[a.delay.status] - order[b.delay.status] || b.delay.days - a.delay.days);

    return result;
  }, [vendasWithDelay, filterStatus, search]);

  const counts = useMemo(() => {
    const c = { atrasado: 0, proximo: 0, andamento: 0 };
    vendasWithDelay.forEach(v => c[v.delay.status]++);
    return c;
  }, [vendasWithDelay]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Vendas Pendentes</h2>
          <p className="text-sm text-muted-foreground">
            Acompanhamento de vendas ativas com alertas de atraso
          </p>
        </div>
        <Button onClick={fetchVendas} disabled={loading} variant="outline" className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Atualizar
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="border-destructive/30 bg-destructive/5 cursor-pointer" onClick={() => setFilterStatus(filterStatus === 'atrasado' ? 'all' : 'atrasado')}>
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <div>
              <p className="text-2xl font-bold text-destructive">{counts.atrasado}</p>
              <p className="text-sm text-muted-foreground">Atrasadas (30+ dias)</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-amber-500/30 bg-amber-500/5 cursor-pointer" onClick={() => setFilterStatus(filterStatus === 'proximo' ? 'all' : 'proximo')}>
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="h-8 w-8 text-amber-500" />
            <div>
              <p className="text-2xl font-bold text-amber-600">{counts.proximo}</p>
              <p className="text-sm text-muted-foreground">Próximas de atrasar (25-29 dias)</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-primary/30 bg-primary/5 cursor-pointer" onClick={() => setFilterStatus(filterStatus === 'andamento' ? 'all' : 'andamento')}>
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-primary" />
            <div>
              <p className="text-2xl font-bold text-primary">{counts.andamento}</p>
              <p className="text-sm text-muted-foreground">Em andamento (&lt;25 dias)</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar por nº venda, cliente, produto..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filtrar estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="atrasado">Atrasadas</SelectItem>
            <SelectItem value="proximo">Próximas de atrasar</SelectItem>
            <SelectItem value="andamento">Em andamento</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Erro</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading && vendas.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {vendas.length === 0 ? 'Nenhuma venda pendente encontrada.' : 'Nenhum resultado para os filtros aplicados.'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(venda => {
            const isExpanded = expandedIds.has(venda.venda_id);
            return (
              <Card key={venda.venda_id} className="overflow-hidden">
                <div
                  className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => toggleExpand(venda.venda_id)}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-lg">#{venda.codigo}</span>
                        <Badge variant="outline">{venda.situacao}</Badge>
                        <DelayBadge status={venda.delay.status} days={venda.delay.days} />
                      </div>
                      <p className="font-medium">{venda.cliente_nome}</p>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                        {venda.cliente_telefone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3.5 w-3.5" />
                            <a href={`tel:${venda.cliente_telefone}`} className="hover:underline" onClick={e => e.stopPropagation()}>
                              {venda.cliente_telefone}
                            </a>
                          </span>
                        )}
                        {(venda.cidade || venda.cep) && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            {[venda.cidade, venda.estado].filter(Boolean).join(', ')}
                            {venda.cep && ` (${venda.cep})`}
                          </span>
                        )}
                        <span>📅 {venda.data}</span>
                        <span>💰 €{parseFloat(venda.valor_total).toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="gap-1">
                        <Package className="h-3 w-3" />
                        {venda.produtos.length} produto{venda.produtos.length !== 1 ? 's' : ''}
                      </Badge>
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t bg-muted/30 p-4 space-y-3">
                    {/* Address */}
                    {venda.endereco && (
                      <div className="text-sm">
                        <p className="font-medium text-muted-foreground mb-1">📍 Morada</p>
                        <p>{venda.endereco}</p>
                        <p>{[venda.cidade, venda.estado, venda.cep].filter(Boolean).join(' - ')}</p>
                      </div>
                    )}

                    {venda.cliente_email && (
                      <div className="text-sm">
                        <p className="font-medium text-muted-foreground mb-1">✉️ Email</p>
                        <a href={`mailto:${venda.cliente_email}`} className="text-primary hover:underline">{venda.cliente_email}</a>
                      </div>
                    )}

                    {venda.observacao && (
                      <div className="text-sm">
                        <p className="font-medium text-muted-foreground mb-1">📝 Observação</p>
                        <p>{venda.observacao}</p>
                      </div>
                    )}

                    {/* Products */}
                    <div>
                      <p className="font-medium text-muted-foreground mb-2 text-sm">📦 Produtos</p>
                      <div className="rounded-md border overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/60">
                            <tr>
                              <th className="text-left p-2 font-medium">Código</th>
                              <th className="text-left p-2 font-medium">Produto</th>
                              <th className="text-right p-2 font-medium">Qtd</th>
                              <th className="text-right p-2 font-medium">Valor Unit.</th>
                            </tr>
                          </thead>
                          <tbody>
                            {venda.produtos.map((p, i) => (
                              <tr key={i} className="border-t">
                                <td className="p-2 font-mono text-xs">{p.codigo || '-'}</td>
                                <td className="p-2">{p.nome || '-'}</td>
                                <td className="p-2 text-right">{p.quantidade}</td>
                                <td className="p-2 text-right">€{parseFloat(p.valor_unitario).toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
