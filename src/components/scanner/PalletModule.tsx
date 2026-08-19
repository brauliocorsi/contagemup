import { useState } from 'react';
import { Truck, MapPin, Loader2, CheckCircle2, Layers } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScanInput } from './ScanInput';
import { PrintMenu } from './PrintMenu';
import { LocationSelect } from '@/components/counting/LocationSelect';
import { PalletSelect } from '@/components/counting/PalletSelect';
import { usePalletContents, useScannerTransfers } from '@/hooks/useScannerData';
import { colisCode, locationCode, palletCode, parseScan } from '@/lib/scanner/commands';
import type { LabelItem } from '@/lib/scanner/labels';
import { toast } from 'sonner';

interface Props {
  onCommand?: (raw: string) => boolean;
}

export function PalletModule({ onCommand }: Props) {
  const [pallet, setPallet] = useState('');
  const [destination, setDestination] = useState('');
  const { data: contents = [], isLoading } = usePalletContents(pallet || null);
  const { transferPallet } = useScannerTransfers();

  const currentLocations = Array.from(new Set(contents.map((c) => c.location || 'Sem localização')));
  const totalUnits = contents.reduce((s, c) => s + c.quantity, 0);

  const handleScan = (raw: string) => {
    if (onCommand?.(raw)) return;
    const parsed = parseScan(raw);
    if (parsed.kind === 'location') {
      setDestination(parsed.value);
      toast.success(`Destino: ${parsed.value}`);
      return;
    }
    setPallet(parsed.value);
    toast.success(`Palete: ${parsed.value}`);
  };

  const labels = (): LabelItem[] => {
    const items: LabelItem[] = [];
    if (pallet) items.push({ code: palletCode(pallet), title: `Palete ${pallet}`, subtitle: destination || currentLocations.join(', ') });
    if (destination) items.push({ code: locationCode(destination), title: `Localização ${destination}`, subtitle: 'Armazém' });
    contents.forEach((c) =>
      items.push({
        code: colisCode(c.product_code, c.colis_number),
        title: c.product_name,
        subtitle: `Coli ${c.colis_number} • ${c.quantity} un.`,
        extra: [`Palete ${pallet}`],
      })
    );
    return items;
  };

  return (
    <div className="space-y-4">
      <ScanInput onScan={handleScan} label="Ler palete (PAL-) e depois a localização (LOC-)" />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Truck className="h-4 w-4" /> Palete e destino
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          <PalletSelect value={pallet} onValueChange={(v) => setPallet(v)} placeholder="Selecionar palete" />
          <LocationSelect value={destination} onValueChange={setDestination} placeholder="Localização destino" />
        </CardContent>
      </Card>

      {pallet && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-sm">Conteúdo de {pallet}</CardTitle>
              <p className="text-xs text-muted-foreground">
                {contents.length} registo(s) • {totalUnits} unidades • {currentLocations.join(', ') || '—'}
              </p>
            </div>
            <PrintMenu getItems={labels} label="Imprimir" />
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading && <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />}
            {!isLoading && contents.length === 0 && (
              <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                Palete sem produtos associados.
              </p>
            )}
            {contents.map((c) => (
              <div key={c.id} className="flex items-center gap-2 rounded-lg border p-2 text-xs">
                <Layers className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.product_name}</p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">
                    {c.product_code} • Coli {c.colis_number} • {c.location || 'Sem localização'}
                  </p>
                </div>
                <Badge variant="secondary">{c.quantity}</Badge>
              </div>
            ))}

            <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span className="truncate">{currentLocations.join(', ') || '—'}</span>
              <span className="mx-1">→</span>
              <span className="font-semibold">{destination || '—'}</span>
            </div>

            <Button
              className="w-full"
              disabled={!pallet || !destination || transferPallet.isPending}
              onClick={() =>
                transferPallet.mutate(
                  { pallet, location: destination },
                  { onSuccess: () => setDestination('') }
                )
              }
            >
              {transferPallet.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              Mover palete completa
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
