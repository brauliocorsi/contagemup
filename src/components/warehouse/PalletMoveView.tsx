import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { mapDatabaseError } from '@/lib/errorMessages';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { LocationSelect } from '@/components/counting/LocationSelect';
import { useWarehouseLocations } from '@/hooks/useWarehouseConfig';
import { Box, MapPin, Search, ArrowRight, Package, Truck } from 'lucide-react';

interface PalletCountRow {
  id: string;
  product_id: string;
  colis_number: number;
  quantity: number;
  location: string | null;
  pallet_number: string | null;
  product: { code: string; name: string } | null;
}

interface PalletGroup {
  pallet: string;
  locations: string[];
  totalQuantity: number;
  productIds: Set<string>;
  rows: PalletCountRow[];
}

const PAGE = 1000;

export function PalletMoveView() {
  const queryClient = useQueryClient();
  const { locations } = useWarehouseLocations();
  const [search, setSearch] = useState('');
  const [selectedPallet, setSelectedPallet] = useState<string | null>(null);
  const [destination, setDestination] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [moving, setMoving] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['pallet-move-counts'],
    queryFn: async () => {
      const all: PalletCountRow[] = [];
      let from = 0;
      // paginate to bypass the 1000 row limit
      while (true) {
        const { data, error } = await supabase
          .from('counts')
          .select('id, product_id, colis_number, quantity, location, pallet_number, product:products(code, name)')
          .not('pallet_number', 'is', null)
          .order('pallet_number', { ascending: true })
          .order('id', { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        all.push(...((data || []) as any as PalletCountRow[]));
        if (!data || data.length < PAGE) break;
        from += PAGE;
      }
      return all;
    },
  });

  const palletGroups = useMemo(() => {
    const map = new Map<string, PalletGroup>();
    rows.forEach((r) => {
      const pallet = (r.pallet_number || '').trim();
      if (!pallet) return;
      let g = map.get(pallet);
      if (!g) {
        g = { pallet, locations: [], totalQuantity: 0, productIds: new Set(), rows: [] };
        map.set(pallet, g);
      }
      g.rows.push(r);
      g.totalQuantity += r.quantity;
      g.productIds.add(r.product_id);
      const loc = (r.location || '').trim();
      if (loc && !g.locations.includes(loc)) g.locations.push(loc);
    });
    return Array.from(map.values()).sort((a, b) => a.pallet.localeCompare(b.pallet, 'pt', { numeric: true }));
  }, [rows]);

  const filteredGroups = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return palletGroups;
    return palletGroups.filter(
      (g) =>
        g.pallet.toLowerCase().includes(term) ||
        g.locations.some((l) => l.toLowerCase().includes(term)) ||
        g.rows.some(
          (r) =>
            r.product?.code?.toLowerCase().includes(term) ||
            r.product?.name?.toLowerCase().includes(term)
        )
    );
  }, [palletGroups, search]);

  const current = palletGroups.find((g) => g.pallet === selectedPallet) || null;

  const productSummary = useMemo(() => {
    if (!current) return [];
    const map = new Map<string, { code: string; name: string; quantity: number; colis: Set<number> }>();
    current.rows.forEach((r) => {
      const key = r.product_id;
      const entry = map.get(key) || {
        code: r.product?.code || '—',
        name: r.product?.name || 'Desconhecido',
        quantity: 0,
        colis: new Set<number>(),
      };
      entry.quantity += r.quantity;
      entry.colis.add(r.colis_number);
      map.set(key, entry);
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt'));
  }, [current]);

  const handleMove = async () => {
    if (!current || !destination.trim()) return;
    const target = destination.trim();
    setMoving(true);
    try {
      const ids = current.rows.map((r) => r.id);
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        const { error } = await supabase.from('counts').update({ location: target }).in('id', chunk);
        if (error) throw error;
      }

      // Keep order-number records aligned with the pallet's new location
      await supabase
        .from('stock_order_numbers')
        .update({ location: target })
        .eq('pallet_number', current.pallet);

      // Keep the warehouse pallet configuration in sync
      const locationRow = locations.find(
        (l) => l.code.trim().toLowerCase() === target.toLowerCase()
      );
      if (locationRow) {
        await supabase
          .from('warehouse_pallets')
          .update({ current_location_id: locationRow.id })
          .eq('code', current.pallet);
      }

      toast.success(`Palete ${current.pallet} movido para ${target}`);
      setDestination('');
      setConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ['pallet-move-counts'] });
      queryClient.invalidateQueries({ queryKey: ['counts'] });
      queryClient.invalidateQueries({ queryKey: ['last-counts'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['warehouse-map-counts'] });
      queryClient.invalidateQueries({ queryKey: ['warehouse-pallets'] });
      queryClient.invalidateQueries({ queryKey: ['pallet-counts'] });
    } catch (error: any) {
      toast.error('Erro ao mover palete: ' + mapDatabaseError(error));
    } finally {
      setMoving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-[320px_1fr]">
        <Skeleton className="h-[420px]" />
        <Skeleton className="h-[420px]" />
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-[340px_1fr]">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Box className="h-4 w-4" />
            Paletes ({filteredGroups.length})
          </CardTitle>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Procurar palete, localização ou produto..."
              className="pl-8"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[520px]">
            <div className="space-y-1 p-3 pt-0">
              {filteredGroups.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum palete encontrado
                </p>
              )}
              {filteredGroups.map((g) => (
                <button
                  key={g.pallet}
                  onClick={() => {
                    setSelectedPallet(g.pallet);
                    setDestination('');
                  }}
                  className={`w-full rounded-lg border p-2.5 text-left transition-colors ${
                    selectedPallet === g.pallet
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:bg-muted/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm truncate">{g.pallet}</span>
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      {g.productIds.size} prod.
                    </Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    {g.locations.length > 0 ? g.locations.join(', ') : 'Sem localização'}
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Truck className="h-4 w-4" />
            Mover palete completo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!current ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              Seleciona um palete à esquerda para mover todos os seus produtos para outra localização.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 p-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Palete</p>
                  <p className="font-semibold">{current.pallet}</p>
                </div>
                <Separator orientation="vertical" className="h-8" />
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Origem</p>
                  <p className="font-medium">
                    {current.locations.length > 0 ? current.locations.join(', ') : 'Sem localização'}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <div className="min-w-[220px] flex-1">
                  <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Destino</p>
                  <LocationSelect value={destination} onValueChange={setDestination} />
                </div>
                <Button
                  disabled={!destination.trim() || moving}
                  onClick={() => setConfirmOpen(true)}
                >
                  Mover palete
                </Button>
              </div>

              <div className="flex flex-wrap gap-3 text-sm">
                <Badge variant="outline">{productSummary.length} produtos</Badge>
                <Badge variant="outline">{current.rows.length} registos de coli</Badge>
                <Badge variant="outline">{current.totalQuantity} unidades</Badge>
              </div>

              <ScrollArea className="h-[380px] rounded-lg border">
                <div className="divide-y">
                  {productSummary.map((p) => (
                    <div key={p.code + p.name} className="flex items-center justify-between gap-3 p-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{p.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {p.code} · colis {Array.from(p.colis).sort((a, b) => a - b).join(', ')}
                        </p>
                      </div>
                      <Badge variant="secondary" className="shrink-0 gap-1">
                        <Package className="h-3 w-3" />
                        {p.quantity}
                      </Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar movimentação de palete</AlertDialogTitle>
            <AlertDialogDescription>
              O palete <strong>{current?.pallet}</strong> e todos os seus{' '}
              {productSummary.length} produtos ({current?.totalQuantity} unidades) passam de{' '}
              <strong>{current?.locations.join(', ') || 'sem localização'}</strong> para{' '}
              <strong>{destination}</strong>. As quantidades e os colis mantêm-se iguais.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={moving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleMove(); }} disabled={moving}>
              {moving ? 'A mover...' : 'Confirmar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
