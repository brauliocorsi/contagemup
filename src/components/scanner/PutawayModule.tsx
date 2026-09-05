import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, CheckCircle2, Loader2, MapPin, PackageSearch, Trash2, Minus, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScanInput } from './ScanInput';
import { LocationSelect } from '@/components/counting/LocationSelect';
import { supabase } from '@/integrations/supabase/client';
import { useProductResolver, useScannerTransfers } from '@/hooks/useScannerData';
import { useReceivingLocations } from '@/hooks/useReceivingLocations';
import { resolveScan } from '@/lib/scanner/resolveScan';
import { scanFeedback } from '@/lib/scanner/feedback';
import { ScanDock, type LastScan } from './ScanDock';
import { toast } from 'sonner';

interface PendingRow {
  id: string;
  product_id: string;
  colis_number: number;
  quantity: number;
  location: string | null;
  product_code: string;
  product_name: string;
}

interface Selected {
  count_id: string;
  quantity: number;
  available: number;
  product_code: string;
  product_name: string;
  colis_number: number;
  from_location: string | null;
}

interface Props {
  onCommand?: (raw: string) => boolean;
}

const norm = (v?: string | null) => (v || '').trim().toUpperCase();

export function PutawayModule({ onCommand }: Props) {
  const resolve = useProductResolver();
  const queryClient = useQueryClient();
  const { codes: receivingCodes, isLoading: loadingZones } = useReceivingLocations();
  const { transferItems } = useScannerTransfers();
  const [selected, setSelected] = useState<Selected[]>([]);
  const [destination, setDestination] = useState('');
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<LastScan | null>(null);

  const { data: pending = [], isLoading } = useQuery({
    queryKey: ['putaway-pending', receivingCodes],
    enabled: receivingCodes.length > 0,
    queryFn: async (): Promise<PendingRow[]> => {
      const { data, error } = await supabase
        .from('counts')
        .select('id, product_id, colis_number, quantity, location, products(code, name)')
        .in('location', receivingCodes)
        .gt('quantity', 0)
        .order('updated_at', { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        product_id: r.product_id as string,
        colis_number: r.colis_number as number,
        quantity: r.quantity as number,
        location: (r.location as string) ?? null,
        product_code: ((r.products as { code?: string } | null)?.code) ?? '',
        product_name: ((r.products as { name?: string } | null)?.name) ?? 'Produto',
      }));
    },
  });

  const totalUnits = useMemo(() => pending.reduce((s, r) => s + r.quantity, 0), [pending]);

  const addRow = (row: PendingRow, qty?: number) => {
    setSelected((prev) => {
      const existing = prev.find((p) => p.count_id === row.id);
      if (existing) {
        const next = Math.min(existing.available, qty ?? existing.quantity + 1);
        return prev.map((p) => (p.count_id === row.id ? { ...p, quantity: next } : p));
      }
      return [
        ...prev,
        {
          count_id: row.id,
          quantity: qty ?? row.quantity,
          available: row.quantity,
          product_code: row.product_code,
          product_name: row.product_name,
          colis_number: row.colis_number,
          from_location: row.location,
        },
      ];
    });
    toast.success(`${row.product_name} — coli ${row.colis_number}`);
  };

  const handleScan = async (raw: string) => {
    if (onCommand?.(raw)) return;
    setBusy(true);
    try {
      const scan = await resolveScan(raw);

      if (scan.kind === 'location') {
        const code = scan.location!.code;
        setDestination(code);
        scanFeedback('ok');
        setLast({ kind: 'localizacao', title: code, detail: 'Destino de arrumação' });
        return;
      }

      if (scan.kind !== 'product' || !scan.product) {
        scanFeedback('error');
        setLast({ kind: 'erro', title: scan.message || 'Código não reconhecido', detail: raw });
        toast.error(scan.message || `Código não reconhecido: ${raw}`);
        return;
      }

      const product = scan.product;
      const rows = pending.filter(
        (r) => r.product_id === product.id && (!scan.colis || r.colis_number === scan.colis)
      );
      if (rows.length === 0) {
        scanFeedback('error');
        setLast({ kind: 'erro', title: product.name, detail: 'Não está em conferência' });
        toast.error(`${product.name} não está em conferência`);
        return;
      }
      rows.forEach((r) => addRow(r));
      scanFeedback('ok');
      setLast({
        kind: 'produto',
        title: product.name,
        detail: `${product.code} • ${rows.length} linha(s) selecionada(s)`,
        quantity: `${rows.reduce((s, r) => s + r.quantity, 0)}`,
      });
    } finally {
      setBusy(false);
    }
  };


  const setQty = (countId: string, qty: number) =>
    setSelected((prev) =>
      prev.map((p) => (p.count_id === countId ? { ...p, quantity: Math.max(0, Math.min(p.available, qty)) } : p))
    );

  const commit = async () => {
    const rows = selected.filter((p) => p.quantity > 0);
    if (rows.length === 0) {
      toast.error('Escolha os itens a arrumar');
      return;
    }
    if (!destination) {
      toast.error('Leia ou escolha a localização de destino');
      return;
    }
    if (receivingCodes.some((c) => norm(c) === norm(destination))) {
      toast.error('O destino não pode ser uma zona de conferência');
      return;
    }
    await transferItems.mutateAsync(
      rows.map((p) => ({ count_id: p.count_id, quantity: p.quantity, location: destination }))
    );
    setSelected([]);
    setDestination('');
    queryClient.invalidateQueries({ queryKey: ['putaway-pending'] });
    queryClient.invalidateQueries({ queryKey: ['unlocated-counts'] });
  };

  if (!loadingZones && receivingCodes.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Ainda não existe nenhuma zona de conferência. Configure uma localização do tipo
          “Conferência (receção)” nas definições de armazém.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <ScanDock last={last} progress={{ done: selected.length, total: pending.length, label: 'Linhas por arrumar' }}>
        <ScanInput
          onScan={handleScan}
          feedback={false}
          placeholder="Ler produto ou destino (LOC-…)"
          autoFocus
        />
      </ScanDock>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Boxes className="h-4 w-4" />
            Arrumação
            <Badge variant="outline" className="ml-auto text-xs">
              {pending.length} linhas · {totalUnits} un.
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Leia o produto (ou coli) que está em conferência e depois a localização de destino.
          </p>
          <LocationSelect value={destination} onValueChange={setDestination} placeholder="Localização de destino…" />
          {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </CardContent>
      </Card>

      {selected.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">A arrumar ({selected.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {selected.map((p) => (
              <div key={p.count_id} className="border rounded-md p-2 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.product_name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{p.product_code}</p>
                  </div>
                  <Badge variant="outline" className="text-xs">Coli {p.colis_number}</Badge>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => setSelected((prev) => prev.filter((x) => x.count_id !== p.count_id))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setQty(p.count_id, p.quantity - 1)}>
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <span className="text-sm font-semibold tabular-nums w-16 text-center">
                    {p.quantity}/{p.available}
                  </span>
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setQty(p.count_id, p.quantity + 1)}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {p.from_location || 'S/L'}
                  </span>
                </div>
              </div>
            ))}
            <Button className="w-full gap-2" onClick={commit} disabled={transferItems.isPending}>
              {transferItems.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Arrumar em {destination || '…'}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <PackageSearch className="h-4 w-4" />
            Pendente de arrumação
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading && <p className="text-sm text-muted-foreground">A carregar…</p>}
          {!isLoading && pending.length === 0 && (
            <p className="text-sm text-muted-foreground">Nada em conferência. Tudo arrumado.</p>
          )}
          {pending.map((r) => (
            <button
              key={r.id}
              onClick={() => addRow(r)}
              className="w-full text-left border rounded-md p-2 hover:bg-accent transition-colors"
            >
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{r.product_name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{r.product_code}</p>
                </div>
                <Badge variant="outline" className="text-xs">Coli {r.colis_number}</Badge>
                <Badge variant="secondary" className="text-xs">{r.quantity} un.</Badge>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {r.location}
              </p>
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
