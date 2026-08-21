import { useState } from 'react';
import { ArrowRightLeft, MapPin, Trash2, Minus, Plus, CheckCircle2, Loader2, PackageSearch, Boxes, X, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScanInput } from './ScanInput';
import { PrintMenu } from './PrintMenu';
import { LocationSelect } from '@/components/counting/LocationSelect';
import { supabase } from '@/integrations/supabase/client';
import { useProductResolver, useScannerTransfers } from '@/hooks/useScannerData';
import { colisCode, locationCode, parseScan } from '@/lib/scanner/commands';
import type { LabelItem } from '@/lib/scanner/labels';
import type { Product } from '@/types/stock';
import { toast } from 'sonner';

interface PendingItem {
  key: string;
  count_id: string;
  quantity: number;
  available: number;
  location: string | null;
  product_code: string;
  product_name: string;
  colis_number: number;
  from_location: string | null;
}

interface StockRow {
  id: string;
  colis_number: number;
  quantity: number;
  location: string | null;
}

interface Props {
  onCommand?: (raw: string) => boolean;
}

export function TransferModule({ onCommand }: Props) {
  const resolve = useProductResolver();
  const [origin, setOrigin] = useState('');
  const [destLocation, setDestLocation] = useState('');
  const [step, setStep] = useState(1);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [choices, setChoices] = useState<{ product: Product; rows: StockRow[]; mismatch?: string } | null>(null);
  const [allowDivergent, setAllowDivergent] = useState(false);
  const { transferItems } = useScannerTransfers();


  const setQty = (key: string, qty: number) =>
    setPending((prev) =>
      prev.map((p) => (p.key === key ? { ...p, quantity: Math.max(0, Math.min(p.available, qty)) } : p))
    );

  /** Adiciona (ou incrementa) um registo de stock concreto à lista pendente. */
  const addRow = (row: StockRow, product: Product, qty?: number) => {
    setPending((prev) => {
      const existing = prev.find((p) => p.count_id === row.id);
      if (existing) {
        const next = Math.min(existing.available, qty ?? existing.quantity + step);
        toast.success(`${product.name} — coli ${row.colis_number}: ${next}/${existing.available}`);
        return prev.map((p) => (p.key === existing.key ? { ...p, quantity: next } : p));
      }
      const initial = Math.min(row.quantity, qty ?? step);
      toast.success(`${product.name} — coli ${row.colis_number}: ${initial}/${row.quantity}`);
      return [
        ...prev,
        {
          key: `${row.id}-${Date.now()}`,
          count_id: row.id,
          quantity: initial,
          available: row.quantity,
          location: null,
          product_code: product.code,
          product_name: product.name,
          colis_number: row.colis_number,
          from_location: row.location,
        },
      ];
    });
  };

  const addScan = async (value: string, coli?: number) => {
    const results = await resolve(value);
    if (results.length === 0) {
      toast.error(`Produto não encontrado: ${value}`);
      return;
    }
    const product = results[0];

    const fetchRows = async (withOrigin: boolean) => {
      let query = supabase
        .from('counts')
        .select('id, colis_number, quantity, location')
        .eq('product_id', product.id)
        .order('colis_number', { ascending: true });
      if (withOrigin && origin) query = query.ilike('location', origin.trim());
      if (coli) query = query.eq('colis_number', coli);
      const { data, error } = await query;
      if (error) throw error;
      return ((data || []) as StockRow[]).filter((r) => r.quantity > 0);
    };

    let rows: StockRow[];
    try {
      rows = await fetchRows(true);
      // Não há stock na origem indicada → validar e mostrar onde o coli realmente está
      if (rows.length === 0 && origin) {
        const anywhere = await fetchRows(false);
        if (anywhere.length > 0) {
          const locs = Array.from(new Set(anywhere.map((r) => r.location || 'S/L'))).join(', ');
          toast.error(
            `${product.name}${coli ? ` — coli ${coli}` : ''} não está em ${origin}. Local real: ${locs}`
          );
          setChoices({
            product,
            rows: anywhere,
            mismatch: `Este produto${coli ? ` (coli ${coli})` : ''} não existe em ${origin}. Localização real: ${locs}.`,
          });
          return;
        }
      }
    } catch (e: any) {
      toast.error('Erro ao procurar stock: ' + e.message);
      return;
    }


    if (rows.length === 0) {
      toast.error(
        `${product.name}${coli ? ` — coli ${coli}` : ''} sem stock disponível`
      );
      return;
    }

    // Já está na lista pendente → incrementa direto (sem voltar a perguntar)
    const already = rows.find((r) => pending.some((p) => p.count_id === r.id));
    if (rows.length === 1 || already) {
      setChoices(null);
      addRow(already ?? rows[0], product);
      return;
    }

    // Vários colis/registos → o utilizador escolhe qual mover
    setChoices({ product, rows });
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
      extra: [destLocation || 'S/L'],
    }));
    if (origin) items.push({ code: locationCode(origin), title: `Localização ${origin}`, subtitle: 'Origem' });
    if (destLocation) items.push({ code: locationCode(destLocation), title: `Localização ${destLocation}`, subtitle: 'Destino' });
    return items;
  };

  const norm = (v?: string | null) => (v || '').trim().toUpperCase();
  const isDivergent = (p: PendingItem) => !!origin && norm(p.from_location) !== norm(origin);

  const commit = () => {
    const rows = pending.filter((p) => p.quantity > 0);
    if (rows.length === 0) return;
    if (!destLocation) {
      toast.error('Defina a localização de destino');
      return;
    }
    if (norm(destLocation) === norm(origin)) {
      toast.error('Origem e destino são iguais');
      return;
    }
    const bad = rows.filter(isDivergent);
    if (bad.length > 0 && !allowDivergent) {
      toast.error(
        `${bad.length} item(s) não estão em ${origin} (ex.: ${bad[0].product_code} está em ${bad[0].from_location || 'S/L'}). Corrija a origem ou confirme a exceção.`
      );
      return;
    }
    transferItems.mutate(
      rows.map((p) => ({
        count_id: p.count_id,
        quantity: p.quantity,
        location: destLocation,
      })),
      {
        onSuccess: () => {
          setPending([]);
          setDestLocation('');
          setAllowDivergent(false);
        },
      }
    );
  };


  const totalUnits = pending.reduce((s, p) => s + p.quantity, 0);
  const divergentCount = pending.filter(isDivergent).length;

  const stepState = (n: number) =>
    n === 1
      ? !!origin
      : n === 2
        ? pending.length > 0
        : !!destLocation;

  return (
    <div className="space-y-4">
      {/* Passos da operação */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { n: 1, title: 'Origem', value: origin || 'Ler LOC-…' },
          { n: 2, title: 'Produtos', value: pending.length ? `${pending.length} item(s) • ${totalUnits} un.` : 'Bipar 1 a 1' },
          { n: 3, title: 'Destino', value: destLocation || 'Ler LOC-…' },
        ].map((s) => (
          <div
            key={s.n}
            className={`rounded-lg border p-2 text-center ${
              stepState(s.n) ? 'border-primary bg-primary/10' : 'border-dashed'
            }`}
          >
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.n}. {s.title}</p>
            <p className="truncate text-xs font-semibold">{s.value}</p>
          </div>
        ))}
      </div>

      <ScanInput
        onScan={handleScan}
        label="1) LOC- origem  •  2) ler produtos (cada leitura soma)  •  3) LOC- destino"
      />

      {/* Escolha de coli quando o produto tem vários registos */}
      {choices && (
        <Card className="border-primary/60 bg-primary/5">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Boxes className="h-4 w-4" /> Escolher coli a transferir
                </CardTitle>
                <p className="truncate text-xs text-muted-foreground">{choices.product.name}</p>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setChoices(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {choices.mismatch && (
              <p className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-2 text-xs font-medium text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {choices.mismatch}
              </p>
            )}
            {choices.rows.map((r) => (
              <div key={r.id} className="flex items-center gap-2 rounded-lg border bg-background p-2 text-xs">

                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">Coli {r.colis_number}</p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">
                    {colisCode(choices.product.code, r.colis_number)} • {r.location || 'S/L'}
                  </p>
                </div>
                <Badge variant="secondary" className="shrink-0">{r.quantity} un.</Badge>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 shrink-0"
                  onClick={() => {
                    addRow(r, choices.product);
                    setChoices(null);
                  }}
                >
                  +{step}
                </Button>
                <Button
                  size="sm"
                  className="h-8 shrink-0"
                  onClick={() => {
                    addRow(r, choices.product, r.quantity);
                    setChoices(null);
                  }}
                >
                  Coli completo
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <MapPin className="h-4 w-4" /> Origem e destino
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-3">
          <LocationSelect value={origin} onValueChange={setOrigin} placeholder="Local de origem" />
          <LocationSelect value={destLocation} onValueChange={setDestLocation} placeholder="Localização destino" />
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
          <PrintMenu getItems={labels} label="Imprimir" disabled={pending.length === 0 && !destLocation} />
        </CardHeader>
        <CardContent className="space-y-2">
          {pending.length === 0 && (
            <p className="flex items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
              <PackageSearch className="h-4 w-4" /> Leia o local de origem e depois os produtos.
            </p>
          )}
          {pending.map((p) => (
            <div
              key={p.key}
              className={`flex flex-wrap items-center gap-2 rounded-lg border p-2 text-xs ${
                isDivergent(p) ? 'border-destructive/60 bg-destructive/5' : ''
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{p.product_name}</p>
                <p className="truncate font-mono text-[11px] text-muted-foreground">
                  {colisCode(p.product_code, p.colis_number)}
                </p>
                <p className="truncate text-muted-foreground">
                  Coli {p.colis_number} • {p.from_location || 'S/L'} → {destLocation || 'S/L'}
                </p>
                {isDivergent(p) && (
                  <p className="flex items-center gap-1 font-medium text-destructive">
                    <AlertTriangle className="h-3 w-3" /> Não está em {origin}
                  </p>
                )}
              </div>

              <Badge variant="secondary" className="shrink-0">máx {p.available}</Badge>
              <Button
                variant="outline"
                size="sm"
                className="h-8 shrink-0"
                onClick={() => setQty(p.key, p.available)}
                disabled={p.quantity === p.available}
              >
                Coli completo
              </Button>
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
          {divergentCount > 0 && (
            <div className="space-y-2 rounded-lg border border-destructive/50 bg-destructive/10 p-2 text-xs">
              <p className="flex items-center gap-2 font-medium text-destructive">
                <AlertTriangle className="h-4 w-4" />
                {divergentCount} item(s) não estão na origem {origin}
              </p>
              <label className="flex items-center gap-2 text-muted-foreground">
                <input
                  type="checkbox"
                  checked={allowDivergent}
                  onChange={(e) => setAllowDivergent(e.target.checked)}
                />
                Confirmo a exceção e quero transferir mesmo assim
              </label>
            </div>
          )}
          <Button
            className="w-full"
            disabled={pending.length === 0 || transferItems.isPending || (divergentCount > 0 && !allowDivergent)}
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
