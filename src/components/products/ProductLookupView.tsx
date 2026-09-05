import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search, Package, MapPin, Boxes, AlertTriangle, History, Forklift, Loader2, ShieldAlert,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { useProductResolver, useProductStockDetail } from '@/hooks/useScannerData';
import type { Product } from '@/types/stock';

interface Props {
  onNavigate?: (tab: string) => void;
}

const isQuarantine = (loc: string | null | undefined) =>
  (loc || '').toUpperCase().includes('QUARENTENA');

/** Localizações que exigem empilhador (nível com requires_forklift). */
function useForkliftLocations() {
  return useQuery({
    queryKey: ['forklift-locations'],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('warehouse_locations')
        .select('code, warehouse_levels(requires_forklift)');
      if (error) throw error;
      const set = new Set<string>();
      (data || []).forEach((row: any) => {
        if (row.warehouse_levels?.requires_forklift) set.add((row.code || '').toUpperCase());
      });
      return set;
    },
  });
}

export function ProductLookupView({ onNavigate }: Props) {
  const resolve = useProductResolver();
  const [term, setTerm] = useState('');
  const [searching, setSearching] = useState(false);
  const [candidates, setCandidates] = useState<Product[]>([]);
  const [product, setProduct] = useState<Product | null>(null);
  const [notFound, setNotFound] = useState(false);

  const { data: detail, isLoading } = useProductStockDetail(product?.id ?? null);
  const { data: forklift } = useForkliftLocations();

  const handleSearch = async (raw?: string) => {
    const value = (raw ?? term).trim();
    if (!value) return;
    setSearching(true);
    setNotFound(false);
    try {
      const results = await resolve(value);
      if (results.length === 0) {
        setProduct(null);
        setCandidates([]);
        setNotFound(true);
      } else if (results.length === 1) {
        setProduct(results[0]);
        setCandidates([]);
      } else {
        setProduct(null);
        setCandidates(results);
      }
    } finally {
      setSearching(false);
    }
  };

  const colis = useMemo(() => {
    if (!detail) return [] as Array<{
      colis_number: number;
      good: number;
      quarantine: number;
      places: Array<{ location: string; quantity: number; quarantine: boolean; forklift: boolean }>;
    }>;
    return Object.keys(detail.byColis)
      .map(Number)
      .sort((a, b) => a - b)
      .map((n) => {
        const rows = detail.byColis[n] || [];
        const places = rows
          .filter((r) => r.quantity !== 0)
          .map((r) => {
            const loc = r.location || 'Sem localização';
            return {
              location: loc,
              quantity: r.quantity,
              quarantine: isQuarantine(loc),
              forklift: !!forklift?.has(loc.toUpperCase()),
            };
          })
          .sort((a, b) => b.quantity - a.quantity);
        return {
          colis_number: n,
          good: places.filter((p) => !p.quarantine).reduce((s, p) => s + p.quantity, 0),
          quarantine: places.filter((p) => p.quarantine).reduce((s, p) => s + p.quantity, 0),
          places,
        };
      });
  }, [detail, forklift]);

  const quarantineTotal = colis.reduce((s, c) => s + c.quarantine, 0);
  const p = detail?.product as (Product & { unidades_fisicas?: number; colis_orfaos?: number }) | undefined;

  return (
    <PageContainer className="p-4">
      <PageHeader
        icon={<Search className="h-5 w-5" />}
        title="Consultar produto"
        description="Onde está a peça, quanto existe e em que estado. Só consulta."
      />

      <Card className="border-border-subtle">
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              autoFocus
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
              placeholder="Ler código de barras ou escrever código, código de fornecedor ou nome"
              className="h-12 text-base"
              inputMode="search"
            />
            <Button className="h-12" onClick={() => handleSearch()} disabled={searching}>
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span className="ml-2">Procurar</span>
            </Button>
          </div>
          {notFound && (
            <p className="mt-2 text-sm text-destructive">Sem resultados para “{term}”.</p>
          )}
        </CardContent>
      </Card>

      {candidates.length > 0 && (
        <Card className="border-border-subtle">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{candidates.length} produtos encontrados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {candidates.map((c) => (
              <button
                key={c.id}
                onClick={() => { setProduct(c); setCandidates([]); }}
                className="w-full text-left rounded-md border border-border-subtle p-3 hover:bg-surface-muted"
              >
                <p className="text-sm font-medium">{c.name}</p>
                <p className="text-xs text-muted-foreground">{c.code}</p>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {isLoading && product && (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {p && (
        <div className="space-y-4">
          <Card className="border-border-subtle">
            <CardContent className="py-4 space-y-4">
              <div>
                <h2 className="font-heading text-lg font-semibold leading-tight">{p.name}</h2>
                <p className="text-sm text-muted-foreground">
                  {p.code}
                  {p.supplier_code ? ` · fornecedor ${p.supplier_code}` : ''}
                  {` · ${p.total_colis} coli(s) por conjunto`}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-border-subtle p-3">
                  <p className="text-xs text-muted-foreground">Conjuntos completos</p>
                  <p className="text-2xl font-bold tabular-nums text-success">{p.current_stock}</p>
                </div>
                <div className="rounded-lg border border-border-subtle p-3">
                  <p className="text-xs text-muted-foreground">Unidades físicas</p>
                  <p className="text-2xl font-bold tabular-nums">{p.unidades_fisicas ?? detail?.total ?? 0}</p>
                </div>
                <div className="rounded-lg border border-border-subtle p-3">
                  <p className="text-xs text-muted-foreground">Colis órfãos</p>
                  <p className="text-2xl font-bold tabular-nums text-warning">{p.colis_orfaos ?? 0}</p>
                </div>
              </div>

              {quarantineTotal > 0 && (
                <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
                  <ShieldAlert className="h-4 w-4 text-destructive shrink-0" />
                  <p className="text-sm text-destructive">
                    {quarantineTotal} unidade(s) em quarentena — não contam para o stock bom.
                  </p>
                </div>
              )}

              <Button variant="outline" size="sm" onClick={() => onNavigate?.('movements')}>
                <History className="h-4 w-4 mr-2" />
                Ver caminho do produto
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border-subtle">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Boxes className="h-4 w-4 text-muted-foreground" />
                Onde está, coli a coli
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {colis.length === 0 && (
                <p className="text-sm text-muted-foreground">Sem stock registado.</p>
              )}
              {colis.map((c) => (
                <div key={c.colis_number} className="rounded-lg border border-border-subtle p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium flex items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      Coli {c.colis_number}/{p.total_colis}
                    </span>
                    <span className="text-sm tabular-nums">
                      {c.good} un.
                      {c.quarantine > 0 && (
                        <span className="ml-2 text-destructive">+{c.quarantine} em quarentena</span>
                      )}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {c.places.map((pl, i) => (
                      <div key={`${pl.location}-${i}`} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <MapPin className={`h-3.5 w-3.5 shrink-0 ${pl.quarantine ? 'text-destructive' : 'text-muted-foreground'}`} />
                          <span className="truncate">{pl.location}</span>
                          {pl.quarantine && (
                            <Badge variant="outline" className="bg-danger-soft text-danger border-danger/20 text-[10px]">
                              Quarentena
                            </Badge>
                          )}
                          {pl.forklift && (
                            <Badge variant="outline" className="text-[10px]">
                              <Forklift className="h-3 w-3 mr-1" />
                              Empilhador
                            </Badge>
                          )}
                        </span>
                        <span className="tabular-nums font-medium">{pl.quantity}</span>
                      </div>
                    ))}
                    {c.places.length === 0 && (
                      <p className="text-xs text-muted-foreground">Sem unidades neste coli.</p>
                    )}
                  </div>
                </div>
              ))}
              {(p.colis_orfaos ?? 0) > 0 && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                  Há partes soltas que não formam conjunto completo.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </PageContainer>
  );
}
