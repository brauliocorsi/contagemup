import { useState } from 'react';
import { ArrowRightLeft, MapPin, Trash2, Minus, Plus, CheckCircle2, Loader2, PackageSearch } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScanInput } from './ScanInput';
import { PrintMenu } from './PrintMenu';
import { LocationSelect } from '@/components/counting/LocationSelect';
import { PalletSelect } from '@/components/counting/PalletSelect';
import { supabase } from '@/integrations/supabase/client';
import { useProductResolver, useScannerTransfers } from '@/hooks/useScannerData';
import { colisCode, locationCode, palletCode, parseScan } from '@/lib/scanner/commands';
import type { LabelItem } from '@/lib/scanner/labels';
import { toast } from 'sonner';

interface PendingItem {
  key: string;
  count_id: string;
  quantity: number;
  available: number;
  location: string | null;
  pallet_number: string | null;
  product_code: string;
  product_name: string;
  colis_number: number;
  from_location: string | null;
  from_pallet: string | null;
}

interface Props {
  onCommand?: (raw: string) => boolean;
}

export function TransferModule({ onCommand }: Props) {
  const resolve = useProductResolver();
  const [origin, setOrigin] = useState('');
  const [destLocation, setDestLocation] = useState('');
  const [destPallet, setDestPallet] = useState('');
  const [step, setStep] = useState(1);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [busy, setBusy] = useState(false);
  const { transferItems } = useScannerTransfers();

  const setQty = (key: string, qty: number) =>
    setPending((prev) =>
      prev.map((p) => (p.key === key ? { ...p, quantity: Math.max(0, Math.min(p.available, qty)) } : p))
    );

  const addScan = async (value: string, coli?: number) => {
    const results = await resolve(value);
    if (results.length === 0) {
      toast.error(`Produto não encontrado: ${value}`);
      return;
    }
    const product = results[0];

    let query = supabase
      .from('counts')
      .select('id, colis_number, quantity, location, pallet_number')
      .eq('product_id', product.id)
      .order('quantity', { ascending: false });
    if (origin) query = query.eq('location', origin);
    if (coli) query = query.eq('colis_number', coli);

    const { data, error } = await query;
    if (error) {
      toast.error('Erro ao procurar stock: ' + error.message);
      return;
    }
    const rows = (data || []).filter((r: any) => r.quantity > 0);
    if (rows.length === 0) {
      toast.error(
        origin
          ? `${product.name} sem stock em ${origin}${coli ? ` (coli ${coli})` : ''}`
          : `${product.name} sem stock localizado`
      );
      return;
    }
    const row: any = rows[0];

    setPending((prev) => {
      const existing = prev.find((p) => p.count_id === row.id);
      if (existing) {
        const next = Math.min(existing.available, existing.quantity + step);
        toast.success(`${product.name} — coli ${row.colis_number}: ${next}/${existing.available}`);
        return prev.map((p) => (p.key === existing.key ? { ...p, quantity: next } : p));
      }
      const qty = Math.min(row.quantity, step);
      toast.success(`${product.name} — coli ${row.colis_number}: ${qty}/${row.quantity}`);
      return [
        ...prev,
        {
          key: `${row.id}-${Date.now()}`,
          count_id: row.id,
          quantity: qty,
          available: row.quantity,
          location: null,
          pallet_number: null,
          product_code: product.code,
          product_name: product.name,
          colis_number: row.colis_number,
          from_location: row.location,
          from_pallet: row.pallet_number,
        },
      ];
    });
  };

  const handleScan = async (raw: string) => {
    if (onCommand?.(raw)) return;
    const parsed = parseScan(raw);

    if (parsed.kind === 'location') {
      if (!origin) {
        setOrigin(parsed.value);
        toast.success(`Origem: ${parsed.value}`);
      } else {
        setDestLocation(parsed.value);
        toast.success(`Destino: ${parsed.value}`);
      }
      return;
    }
    if (parsed.kind === 'pallet') {
      setDestPallet(parsed.value);
      toast.success(`Palete destino: ${parsed.value}`);
      return;
    }

    setBusy(true);
    try {
      await addScan(parsed.value, parsed.colis);
    } finally {
      setBusy(false);
    }
  };

  const labels = (): LabelItem[] => {
    const items: LabelItem[] = pending.map((p) => ({
      code: colisCode(p.product_code, p.colis_number),
      title: p.product_name,
      subtitle: `Coli ${p.colis_number} • ${p.quantity} un.`,
      extra: [`${destLocation || 'S/L'}${destPallet ? ` / ${destPallet}` : ''}`],
    }));
    if (origin) items.push({ code: locationCode(origin), title: `Localização ${origin}`, subtitle: 'Origem' });
    if (destLocation) items.push({ code: locationCode(destLocation), title: `Localização ${destLocation}`, subtitle: 'Destino' });
    if (destPallet) items.push({ code: palletCode(destPallet), title: `Palete ${destPallet}`, subtitle: destLocation || '' });
    return items;
  };

  const commit = () => {
    const rows = pending.filter((p) => p.quantity > 0);
    if (rows.length === 0) return;
    if (!destLocation && !destPallet) {
      toast.error('Defina a localização ou palete de destino');
      return;
    }
    transferItems.mutate(
      rows.map((p) => ({
        count_id: p.count_id,
        quantity: p.quantity,
        location: destLocation || null,
        pallet_number: destPallet || null,
      })),
      {
        onSuccess: () => {
          setPending([]);
          setDestLocation('');
          setDestPallet('');
        },
      }
    );
  };

  return (
    <div className="space-y-4">
      <ScanInput
        onScan={handleScan}
        label="1) LOC- origem  •  2) ler produtos (cada leitura soma)  •  3) LOC-/PAL- destino"
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <MapPin className="h-4 w-4" /> Origem e destino
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-3">
          <LocationSelect value={origin} onValueChange={setOrigin} placeholder="Local de origem" />
          <LocationSelect value={destLocation} onValueChange={setDestLocation} placeholder="Localização destino" />
          <PalletSelect
            value={destPallet}
            onValueChange={(v, loc) => {
              setDestPallet(v);
              if (loc && !destLocation) setDestLocation(loc);
            }}
            placeholder="Palete destino"
          />
        </CardContent>
        <CardContent className="flex items-center gap-2 pt-0 text-xs text-muted-foreground">
          <span>Cada leitura conta</span>
          <Input
            type="number"
            min={1}
            value={step}
            className="h-8 w-16"
            onChange={(e) => setStep(Math.max(1, Number(e.target.value) || 1))}
          />
          <span>un.</span>
          {busy && <Loader2 className="ml-auto h-4 w-4 animate-spin" />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm">Itens lidos ({pending.length})</CardTitle>
          <PrintMenu getItems={labels} label="Imprimir" disabled={pending.length === 0 && !destLocation && !destPallet} />
        </CardHeader>
        <CardContent className="space-y-2">
          {pending.length === 0 && (
            <p className="flex items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
              <PackageSearch className="h-4 w-4" /> Leia o local de origem e depois os produtos.
            </p>
          )}
          {pending.map((p) => (
            <div key={p.key} className="flex items-center gap-2 rounded-lg border p-2 text-xs">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{p.product_name}</p>
                <p className="truncate text-muted-foreground">
                  Coli {p.colis_number} • {p.from_location || 'S/L'}
                  {p.from_pallet ? ` / ${p.from_pallet}` : ''} → {destLocation || 'S/L'}
                  {destPallet ? ` / ${destPallet}` : ''}
                </p>
              </div>
              <Badge variant="secondary" className="shrink-0">máx {p.available}</Badge>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setQty(p.key, p.quantity - 1)}>
                <Minus className="h-3.5 w-3.5" />
              </Button>
              <Input
                type="number"
                min={0}
                max={p.available}
                value={p.quantity}
                className="h-8 w-16"
                onChange={(e) => setQty(p.key, Number(e.target.value) || 0)}
              />
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setQty(p.key, p.quantity + 1)}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPending((prev) => prev.filter((x) => x.key !== p.key))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            className="w-full"
            disabled={pending.length === 0 || transferItems.isPending}
            onClick={commit}
          >
            {transferItems.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            <ArrowRightLeft className="mr-2 h-4 w-4" /> Confirmar transferência
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
