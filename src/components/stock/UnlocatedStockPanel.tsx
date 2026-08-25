import { useMemo, useState } from 'react';
import { AlertTriangle, MapPin, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LocationSelect } from '@/components/counting/LocationSelect';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useProducts } from '@/hooks/useProducts';
import { toast } from 'sonner';
import type { Product } from '@/types/stock';

interface UnlocatedRow {
  id: string;
  product_id: string;
  colis_number: number;
  quantity: number;
  location?: string | null;
}

export function UnlocatedStockPanel() {
  const queryClient = useQueryClient();
  const { products } = useProducts();
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<Record<string, { location: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [bulkLocation, setBulkLocation] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);

  const productMap = useMemo(() => {
    const m = new Map<string, Product>();
    products.forEach(p => m.set(p.id, p));
    return m;
  }, [products]);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['unlocated-counts'],
    queryFn: async (): Promise<UnlocatedRow[]> => {
      // Zonas livres (ex: conferência) contam como stock pendente de localização
      const { data: stagingLocs } = await supabase
        .from('warehouse_locations')
        .select('code, is_staging, location_type');
      const stagingCodes = (stagingLocs || [])
        .filter(l => l.is_staging || l.location_type === 'conferencia')
        .map(l => l.code)
        .filter(Boolean);

      const orFilter = [
        'location.is.null',
        'location.eq.',
        ...stagingCodes.map(c => `location.eq.${c}`),
      ].join(',');

      const all: UnlocatedRow[] = [];
      let from = 0;
      const step = 1000;
      // paginate: Supabase caps at 1000 rows per request
      for (;;) {
        const { data, error } = await supabase
          .from('counts')
          .select('id, product_id, colis_number, quantity, location')
          .or(orFilter)
          .gt('quantity', 0)
          .order('product_id', { ascending: true })
          .order('id', { ascending: true })
          .range(from, from + step - 1);
        if (error) throw error;
        all.push(...((data || []) as UnlocatedRow[]));
        if (!data || data.length < step) break;
        from += step;
      }
      return all;
    },
  });



  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    const withProduct = rows.map(r => ({ row: r, product: productMap.get(r.product_id) }));
    if (!term) return withProduct.slice(0, 100);
    return withProduct
      .filter(({ product }) =>
        product &&
        (product.code.toLowerCase().includes(term) || product.name.toLowerCase().includes(term)))
      .slice(0, 100);
  }, [rows, productMap, search]);

  const totalUnits = rows.reduce((s, r) => s + r.quantity, 0);

  const assign = async (countId: string, location: string) => {
    const { error } = await supabase.rpc('assign_count_location', {
      p_count_id: countId,
      p_location: location,
    });
    if (error) throw error;
  };

  const applyBulk = async () => {
    if (!bulkLocation) {
      toast.error('Indique a localização de destino');
      return;
    }
    setBulkSaving(true);
    try {
      for (const { row } of filtered) {
        await assign(row.id, bulkLocation);
      }
      toast.success(`${filtered.length} linhas arrumadas em ${bulkLocation}`);
      setDraft({});
      setBulkLocation('');
      queryClient.invalidateQueries({ queryKey: ['unlocated-counts'] });
      queryClient.invalidateQueries({ queryKey: ['counts'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao arrumar em lote');
    } finally {
      setBulkSaving(false);
    }
  };

  const save = async (row: UnlocatedRow) => {
    const d = draft[row.id];
    if (!d?.location) {
      toast.error('Indique uma localização');
      return;
    }
    setSavingId(row.id);
    try {
      await assign(row.id, d.location || '');
      toast.success('Localização atribuída');
      setDraft(prev => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['unlocated-counts'] });
      queryClient.invalidateQueries({ queryKey: ['counts'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao atribuir localização');
    } finally {
      setSavingId(null);
    }
  };

  if (!isLoading && rows.length === 0) return null;

  return (
    <Card className="border-amber-300">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          Pendente de arrumação
          <Badge variant="outline" className="ml-auto border-amber-400 text-amber-700">
            {rows.length} linhas · {totalUnits} un.
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Unidades em conferência/receção ou sem sítio definido. Escolha a localização final para as arrumar.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
          <LocationSelect
            value={bulkLocation}
            onValueChange={setBulkLocation}
            placeholder="Destino para todas as linhas listadas…"
          />
          <Button
            size="sm"
            variant="secondary"
            className="gap-1"
            onClick={applyBulk}
            disabled={bulkSaving || filtered.length === 0}
          >
            <Check className="h-3.5 w-3.5" />
            {bulkSaving ? 'A arrumar…' : `Arrumar ${filtered.length} linhas`}
          </Button>
        </div>
        <Input
          placeholder="Filtrar por código ou nome…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {isLoading ? (
          <p className="text-sm text-muted-foreground">A carregar…</p>
        ) : (
          <ScrollArea className="h-[420px] w-full">
            <div className="space-y-2 pr-3">
              {filtered.map(({ row, product }) => {
                const d = draft[row.id] || { location: '' };
                return (
                  <div key={row.id} className="border rounded-md p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{product?.name ?? 'Produto desconhecido'}</p>
                        <p className="text-xs text-muted-foreground font-mono">{product?.code ?? row.product_id.slice(0, 8)}</p>
                      </div>
                      <Badge variant="outline" className="text-xs">Coli {row.colis_number}</Badge>
                      <Badge variant="secondary" className="text-xs">{row.quantity} un.</Badge>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
                      <LocationSelect
                        value={d.location}
                        onValueChange={(v) => setDraft(prev => ({ ...prev, [row.id]: { location: v } }))}
                        placeholder="Localização…"
                      />
                      <Button
                        size="sm"
                        className="gap-1"
                        onClick={() => save(row)}
                        disabled={savingId === row.id}
                      >
                        {savingId === row.id ? '…' : <><Check className="h-3.5 w-3.5" /> Guardar</>}
                      </Button>
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <MapPin className="h-4 w-4" /> Sem resultados para o filtro.
                </p>
              )}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
