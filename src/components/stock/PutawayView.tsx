import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, PackageSearch, Check } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { LocationSelect } from '@/components/counting/LocationSelect';
import { PageHeader } from '@/components/layout/PageHeader';
import { mapDatabaseError } from '@/lib/errorMessages';

export const UNLOCATED_CODE = 'SEM-LOCALIZACAO';

interface Row {
  id: string;
  product_id: string;
  colis_number: number;
  quantity: number;
  location: string | null;
  code: string;
  name: string;
  barcode: string | null;
}

async function fetchUnlocated(): Promise<Row[]> {
  const all: Row[] = [];
  let from = 0;
  const step = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from('counts')
      .select('id, product_id, colis_number, quantity, location, products(code, name, barcode)')
      .or(`location.is.null,location.eq.,location.eq.${UNLOCATED_CODE}`)
      .gt('quantity', 0)
      .order('quantity', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + step - 1);
    if (error) throw error;
    const rows = (data || []) as unknown as Array<Row & { products: { code: string; name: string; barcode: string | null } | null }>;
    all.push(
      ...rows.map(r => ({
        id: r.id,
        product_id: r.product_id,
        colis_number: r.colis_number,
        quantity: r.quantity,
        location: r.location,
        code: r.products?.code ?? '',
        name: r.products?.name ?? 'Produto desconhecido',
        barcode: r.products?.barcode ?? null,
      })),
    );
    if (rows.length < step) break;
    from += step;
  }
  return all;
}

export function PutawayView() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [location, setLocation] = useState('');
  const [saving, setSaving] = useState(false);
  const [initialUnits, setInitialUnits] = useState<number | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['putaway-unlocated'],
    queryFn: fetchUnlocated,
  });

  const totalUnits = rows.reduce((s, r) => s + r.quantity, 0);

  useEffect(() => {
    if (initialUnits === null && !isLoading && rows.length > 0) setInitialUnits(totalUnits);
  }, [initialUnits, isLoading, rows.length, totalUnits]);

  const baseline = initialUnits ?? totalUnits;
  const done = Math.max(0, baseline - totalUnits);
  const progress = baseline > 0 ? Math.round((done / baseline) * 100) : 100;

  // Agrupar por produto, ordenado por unidades decrescentes
  const groups = useMemo(() => {
    const term = search.toLowerCase().trim();
    const map = new Map<string, { code: string; name: string; units: number; rows: Row[] }>();
    rows.forEach(r => {
      if (term && !(r.code.toLowerCase().includes(term) || r.name.toLowerCase().includes(term) || (r.barcode ?? '').toLowerCase().includes(term))) return;
      const g = map.get(r.product_id) ?? { code: r.code, name: r.name, units: 0, rows: [] };
      g.units += r.quantity;
      g.rows.push(r);
      map.set(r.product_id, g);
    });
    return Array.from(map.entries())
      .map(([product_id, g]) => ({ product_id, ...g, rows: g.rows.sort((a, b) => a.colis_number - b.colis_number) }))
      .sort((a, b) => b.units - a.units);
  }, [rows, search]);

  const selectedIds = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);
  const selectedUnits = rows.filter(r => selected[r.id]).reduce((s, r) => s + r.quantity, 0);

  const toggleProduct = (productId: string, on: boolean) => {
    const g = groups.find(x => x.product_id === productId);
    if (!g) return;
    setSelected(prev => {
      const next = { ...prev };
      g.rows.forEach(r => { next[r.id] = on; });
      return next;
    });
  };

  const confirm = async () => {
    if (!location || selectedIds.length === 0) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc('putaway_counts', {
        p_count_ids: selectedIds,
        p_location: location,
      });
      if (error) throw error;
      toast.success(`${selectedUnits} unidades arrumadas em ${location}`);
      setSelected({});
      setLocation('');
      queryClient.invalidateQueries({ queryKey: ['putaway-unlocated'] });
      queryClient.invalidateQueries({ queryKey: ['unlocated-counts'] });
      queryClient.invalidateQueries({ queryKey: ['counts'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['warehouse-map-counts'] });
    } catch (e) {
      toast.error(mapDatabaseError(e, 'Não foi possível arrumar o stock'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Arrumação"
        description="Dar morada ao stock que está sem localização definida."
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <PackageSearch className="h-4 w-4" />
            Por arrumar
            <Badge variant="outline" className="ml-auto">
              {rows.length} linhas · {totalUnits} un.
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Progress value={progress} />
          <p className="text-xs text-muted-foreground">
            {done} de {baseline} unidades já arrumadas nesta sessão.
          </p>

          <Input
            placeholder="Procurar por código, nome ou código de barras…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
            <LocationSelect
              value={location}
              onValueChange={setLocation}
              placeholder="Localização de destino (obrigatório)…"
            />
            <Button
              className="gap-1"
              onClick={confirm}
              disabled={saving || !location || selectedIds.length === 0}
            >
              <Check className="h-4 w-4" />
              {saving ? 'A arrumar…' : `Arrumar ${selectedUnits} un.`}
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">A carregar…</p>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
            <MapPin className="h-5 w-5" />
            Não há stock por arrumar.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {groups.map(g => {
            const allOn = g.rows.every(r => selected[r.id]);
            return (
              <Card key={g.product_id}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox checked={allOn} onCheckedChange={(v) => toggleProduct(g.product_id, !!v)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{g.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{g.code}</p>
                    </div>
                    <Badge variant="secondary" className="text-xs">{g.units} un.</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2 pl-6">
                    {g.rows.map(r => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setSelected(prev => ({ ...prev, [r.id]: !prev[r.id] }))}
                        className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                          selected[r.id] ? 'bg-primary text-primary-foreground border-primary' : 'bg-background'
                        }`}
                      >
                        Coli {r.colis_number} · {r.quantity} un.
                        {r.location ? ` · ${r.location}` : ' · sem morada'}
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
