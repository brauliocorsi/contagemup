import { useState } from 'react';
import { ArrowRightLeft, MapPin, Trash2, Boxes, CheckCircle2, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScanInput } from './ScanInput';
import { PrintMenu } from './PrintMenu';
import { LocationSelect } from '@/components/counting/LocationSelect';
import { PalletSelect } from '@/components/counting/PalletSelect';
import {
  useProductResolver,
  useProductStockDetail,
  useScannerTransfers,
  type TransferItem,
} from '@/hooks/useScannerData';
import { colisCode, locationCode, palletCode, parseScan } from '@/lib/scanner/commands';
import type { LabelItem } from '@/lib/scanner/labels';
import type { Product } from '@/types/stock';
import { toast } from 'sonner';

interface PendingItem extends TransferItem {
  key: string;
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
  const [product, setProduct] = useState<Product | null>(null);
  const { data: detail } = useProductStockDetail(product?.id ?? null);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [destLocation, setDestLocation] = useState('');
  const [destPallet, setDestPallet] = useState('');
  const [pending, setPending] = useState<PendingItem[]>([]);
  const { transferItems } = useScannerTransfers();

  const handleScan = async (raw: string) => {
    if (onCommand?.(raw)) return;
    const parsed = parseScan(raw);

    if (parsed.kind === 'location') {
      setDestLocation(parsed.value);
      toast.success(`Destino: ${parsed.value}`);
      return;
    }
    if (parsed.kind === 'pallet') {
      setDestPallet(parsed.value);
      toast.success(`Palete destino: ${parsed.value}`);
      return;
    }

    const results = await resolve(parsed.value);
    if (results.length === 0) {
      toast.error(`Produto não encontrado: ${parsed.value}`);
      return;
    }
    const found = results[0];

    // Leitura repetida do mesmo produto: incrementa a quantidade em vez de reiniciar.
    if (product && found.id === product.id && detail) {
      const coli = parsed.colis;
      const row = coli ? detail.rows.find((r) => r.colis_number === coli) : detail.rows[0];
      if (row) {
        setSelected((prev) => {
          const next = Math.min(row.quantity, (prev[row.id] || 0) + 1);
          toast.success(`${found.name} — coli ${row.colis_number}: ${next}/${row.quantity}`);
          return { ...prev, [row.id]: next };
        });
        return;
      }
    }

    setProduct(found);
    setSelected({});
    toast.success(parsed.colis ? `${found.name} — coli ${parsed.colis}` : found.name);

  };

  const addSelection = () => {
    if (!detail) return;
    if (!destLocation && !destPallet) {
      toast.error('Defina a localização ou palete de destino');
      return;
    }
    const rows = detail.rows.filter((r) => (selected[r.id] || 0) > 0);
    if (rows.length === 0) {
      toast.error('Selecione pelo menos um coli/quantidade');
      return;
    }
    setPending((prev) => [
      ...prev,
      ...rows.map((r) => ({
        key: `${r.id}-${Date.now()}`,
        count_id: r.id,
        quantity: Math.min(selected[r.id], r.quantity),
        location: destLocation || null,
        pallet_number: destPallet || null,
        product_code: detail.product.code,
        product_name: detail.product.name,
        colis_number: r.colis_number,
        from_location: r.location,
        from_pallet: r.pallet_number,
      })),
    ]);
    setSelected({});
    setProduct(null);
    toast.success('Adicionado à transferência');
  };

  const labels = (): LabelItem[] => {
    const items: LabelItem[] = pending.map((p) => ({
      code: colisCode(p.product_code, p.colis_number),
      title: p.product_name,
      subtitle: `Coli ${p.colis_number} • ${p.quantity} un.`,
      extra: [`${p.location || 'S/L'}${p.pallet_number ? ` / ${p.pallet_number}` : ''}`],
    }));
    if (destLocation) items.push({ code: locationCode(destLocation), title: `Localização ${destLocation}`, subtitle: 'Armazém' });
    if (destPallet) items.push({ code: palletCode(destPallet), title: `Palete ${destPallet}`, subtitle: destLocation || '' });
    return items;
  };

  const commit = () => {
    if (pending.length === 0) return;
    transferItems.mutate(
      pending.map(({ count_id, quantity, location, pallet_number }) => ({ count_id, quantity, location, pallet_number })),
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
      <ScanInput onScan={handleScan} label="Ler produto / coli (ou LOC- / PAL- para destino)" />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <MapPin className="h-4 w-4" /> Destino
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
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
      </Card>

      {detail && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm leading-tight">{detail.product.name}</CardTitle>
            <p className="font-mono text-xs text-muted-foreground">{detail.product.code}</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {detail.rows.length === 0 && (
              <p className="text-sm text-muted-foreground">Este produto não tem stock localizado.</p>
            )}
            {detail.rows.map((r) => (
              <div key={r.id} className="flex items-center gap-2 rounded-lg border p-2">
                <Checkbox
                  checked={(selected[r.id] || 0) > 0}
                  onCheckedChange={(c) =>
                    setSelected((prev) => ({ ...prev, [r.id]: c ? r.quantity : 0 }))
                  }
                />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-xs font-medium">
                    <Boxes className="h-3.5 w-3.5" /> Coli {r.colis_number}
                    <Badge variant="secondary" className="ml-1">{r.quantity} un.</Badge>
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {r.location || 'Sem localização'}{r.pallet_number ? ` • ${r.pallet_number}` : ''}
                  </p>
                </div>
                <Input
                  type="number"
                  min={0}
                  max={r.quantity}
                  value={selected[r.id] ?? ''}
                  placeholder="Qtd"
                  className="h-9 w-20"
                  onChange={(e) =>
                    setSelected((prev) => ({ ...prev, [r.id]: Math.max(0, Math.min(r.quantity, Number(e.target.value) || 0)) }))
                  }
                />
              </div>
            ))}
            <Button className="w-full" onClick={addSelection}>
              <ArrowRightLeft className="mr-2 h-4 w-4" /> Adicionar à transferência
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm">Transferências pendentes ({pending.length})</CardTitle>
          <PrintMenu getItems={labels} label="Imprimir" disabled={pending.length === 0 && !destLocation && !destPallet} />
        </CardHeader>
        <CardContent className="space-y-2">
          {pending.length === 0 && (
            <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
              Sem itens. Leia um produto e selecione os colis a mover.
            </p>
          )}
          {pending.map((p) => (
            <div key={p.key} className="flex items-center gap-2 rounded-lg border p-2 text-xs">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{p.product_name}</p>
                <p className="truncate text-muted-foreground">
                  Coli {p.colis_number} • {p.quantity} un. • {p.from_location || 'S/L'} → {p.location || 'S/L'}
                  {p.pallet_number ? ` / ${p.pallet_number}` : ''}
                </p>
              </div>
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
            Confirmar transferência
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
