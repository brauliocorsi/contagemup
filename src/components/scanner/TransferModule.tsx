import { useState } from 'react';
import {
  ArrowRightLeft,
  MapPin,
  Minus,
  Plus,
  CheckCircle2,
  Loader2,
  Boxes,
  X,
  RotateCcw,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScanInput } from './ScanInput';
import { ScanDock, type LastScan } from './ScanDock';
import { LocationSelect } from '@/components/counting/LocationSelect';
import { supabase } from '@/integrations/supabase/client';
import { useScannerTransfers } from '@/hooks/useScannerData';
import { colisCode } from '@/lib/scanner/commands';
import { resolveScan } from '@/lib/scanner/resolveScan';
import { scanFeedback } from '@/lib/scanner/feedback';
import { toast } from 'sonner';

interface StockRow {
  id: string;
  colis_number: number;
  quantity: number;
  location: string | null;
}

interface Selection {
  count_id: string;
  quantity: number;
  available: number;
  product_code: string;
  product_name: string;
  colis_number: number;
  from_location: string | null;
}

interface HistoryEntry {
  id: string;
  text: string;
}

interface Props {
  onCommand?: (raw: string) => boolean;
}

const norm = (v?: string | null) => (v || '').trim().toUpperCase();

/**
 * Transferência inteiramente por leitura:
 * 1) LOC- origem → 2) produto/coli → 3) quantidade → 4) LOC- destino executa.
 */
export function TransferModule({ onCommand }: Props) {
  const [origin, setOrigin] = useState('');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [choices, setChoices] = useState<{ name: string; code: string; rows: StockRow[] } | null>(null);
  const [last, setLast] = useState<LastScan | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const { transferItems } = useScannerTransfers();

  const fail = (title: string, detail?: string) => {
    scanFeedback('error');
    setLast({ kind: 'erro', title, detail });
    toast.error(detail ? `${title} — ${detail}` : title);
  };

  const pickRow = (row: StockRow, product: { code: string; name: string }) => {
    setChoices(null);
    setSelection((prev) => {
      if (prev && prev.count_id === row.id) {
        const next = Math.min(prev.available, prev.quantity + 1);
        setLast({
          kind: 'produto',
          title: product.name,
          detail: `${colisCode(product.code, row.colis_number)} • ${row.location || 'S/L'}`,
          quantity: `${next}`,
          remaining: `saldo ${prev.available}`,
        });
        return { ...prev, quantity: next };
      }
      setLast({
        kind: 'produto',
        title: product.name,
        detail: `${colisCode(product.code, row.colis_number)} • ${row.location || 'S/L'}`,
        quantity: '1',
        remaining: `saldo ${row.quantity}`,
      });
      return {
        count_id: row.id,
        quantity: 1,
        available: row.quantity,
        product_code: product.code,
        product_name: product.name,
        colis_number: row.colis_number,
        from_location: row.location,
      };
    });
  };

  const execute = async (destination: string) => {
    if (!selection) {
      fail('Leia primeiro o produto a mover');
      return;
    }
    if (norm(destination) === norm(selection.from_location)) {
      fail('Origem e destino são iguais', destination);
      return;
    }
    const wanted = selection.quantity;
    const moving = Math.min(wanted, selection.available);
    if (moving <= 0) {
      fail('Sem saldo na origem', selection.product_name);
      return;
    }
    try {
      await transferItems.mutateAsync([
        { count_id: selection.count_id, quantity: moving, location: destination },
      ]);
    } catch {
      fail('Não foi possível transferir', selection.product_name);
      return;
    }
    const shortfall = wanted - moving;
    if (shortfall > 0) {
      scanFeedback('error');
      toast.warning(`Só havia ${moving} un. em ${selection.from_location || 'origem'}. Faltaram ${shortfall}.`);
    } else {
      scanFeedback('done');
    }
    setLast({
      kind: 'ok',
      title: `${selection.product_name} → ${destination}`,
      detail:
        `${colisCode(selection.product_code, selection.colis_number)} • de ${selection.from_location || 'S/L'}` +
        (shortfall > 0 ? ` • faltaram ${shortfall} un.` : ''),
      quantity: `${moving}`,
      remaining: shortfall > 0 ? `pedido ${wanted}` : 'transferido',
    });
    setHistory((prev) => [
      {
        id: `${selection.count_id}-${Date.now()}`,
        text: `${moving} un. • ${selection.product_name} (coli ${selection.colis_number}) • ${
          selection.from_location || 'S/L'
        } → ${destination}`,
      },
      ...prev,
    ].slice(0, 20));
    setSelection(null);
  };

  const loadProduct = async (productId: string, product: { code: string; name: string }, colis?: number) => {
    let query = supabase
      .from('counts')
      .select('id, colis_number, quantity, location')
      .eq('product_id', productId)
      .gt('quantity', 0)
      .order('colis_number', { ascending: true });
    if (origin) query = query.ilike('location', origin);
    if (colis) query = query.eq('colis_number', colis);
    const { data, error } = await query;
    if (error) {
      fail('Erro ao procurar stock', error.message);
      return;
    }
    const rows = (data || []) as StockRow[];

    if (rows.length === 0) {
      // Onde está mesmo?
      const { data: anywhere } = await supabase
        .from('counts')
        .select('id, colis_number, quantity, location')
        .eq('product_id', productId)
        .gt('quantity', 0);
      const locs = Array.from(new Set(((anywhere || []) as StockRow[]).map((r) => r.location || 'S/L')));
      fail(
        `${product.name} não tem saldo em ${origin || 'nenhuma origem'}`,
        locs.length ? `Está em: ${locs.join(', ')}` : 'Sem stock registado',
      );
      return;
    }

    if (rows.length === 1) {
      pickRow(rows[0], product);
      return;
    }
    setChoices({ name: product.name, code: product.code, rows });
    setLast({ kind: 'produto', title: product.name, detail: 'Escolha o coli a mover' });
  };

  const handleScan = async (raw: string) => {
    if (onCommand?.(raw)) return;
    setBusy(true);
    try {
      const scan = await resolveScan(raw);

      if (scan.kind === 'location') {
        const code = scan.location!.code;
        if (!origin) {
          setOrigin(code);
          setLast({ kind: 'localizacao', title: code, detail: 'Origem definida — leia agora o produto' });
          return;
        }
        if (!selection) {
          setOrigin(code);
          setLast({ kind: 'localizacao', title: code, detail: 'Nova origem — leia agora o produto' });
          return;
        }
        await execute(code);
        return;
      }

      if (scan.kind === 'product' && scan.product) {
        await loadProduct(scan.product.id, { code: scan.product.code, name: scan.product.name }, scan.colis);
        return;
      }

      fail(scan.message || 'Código não reconhecido', raw);
    } finally {
      setBusy(false);
    }
  };

  const changeQty = (delta: number) =>
    setSelection((prev) =>
      prev ? { ...prev, quantity: Math.max(1, Math.min(prev.available, prev.quantity + delta)) } : prev,
    );

  return (
    <div className="space-y-4">
      <ScanDock last={last}>
        <ScanInput
          onScan={handleScan}
          feedback={false}
          label="1) LOC- origem • 2) produto/coli • 3) quantidade • 4) LOC- destino executa"
        />
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className={`rounded-lg border p-2 ${origin ? 'border-primary bg-primary/10' : 'border-dashed'}`}>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Origem</p>
            <p className="truncate font-semibold">{origin || 'Ler LOC-…'}</p>
          </div>
          <div className={`rounded-lg border p-2 ${selection ? 'border-primary bg-primary/10' : 'border-dashed'}`}>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">A mover</p>
            <p className="truncate font-semibold">
              {selection ? `${selection.quantity} un. • coli ${selection.colis_number}` : 'Ler produto'}
            </p>
          </div>
        </div>
      </ScanDock>

      {busy && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> A procurar…
        </p>
      )}

      {choices && (
        <Card className="border-primary/60 bg-primary/5">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Boxes className="h-4 w-4" /> Escolher coli — {choices.name}
              </CardTitle>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setChoices(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {choices.rows.map((r) => (
              <button
                key={r.id}
                onClick={() => pickRow(r, { code: choices.code, name: choices.name })}
                className="flex w-full items-center gap-2 rounded-lg border bg-background p-2 text-left text-xs hover:border-primary"
              >
                <Badge variant="outline">Coli {r.colis_number}</Badge>
                <span className="flex-1 truncate text-muted-foreground">{r.location || 'S/L'}</span>
                <span className="font-semibold tabular-nums">{r.quantity} un.</span>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {selection && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <ArrowRightLeft className="h-4 w-4" /> Quantidade a transferir
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="truncate text-sm font-semibold">{selection.product_name}</p>
              <p className="truncate font-mono text-xs text-muted-foreground">
                {colisCode(selection.product_code, selection.colis_number)} • {selection.from_location || 'S/L'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="icon" className="h-14 w-14" onClick={() => changeQty(-1)}>
                <Minus className="h-6 w-6" />
              </Button>
              <div className="flex-1 text-center">
                <p className="text-4xl font-extrabold tabular-nums leading-none">{selection.quantity}</p>
                <p className="text-[11px] text-muted-foreground">saldo {selection.available} un.</p>
              </div>
              <Button variant="outline" size="icon" className="h-14 w-14" onClick={() => changeQty(1)}>
                <Plus className="h-6 w-6" />
              </Button>
              <Button
                variant="secondary"
                className="h-14 shrink-0"
                onClick={() => setSelection({ ...selection, quantity: selection.available })}
              >
                Coli completo
              </Button>
            </div>

            <div className="space-y-2 rounded-lg border border-dashed p-2">
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" /> Leia o destino (LOC-) para executar — ou escolha aqui:
              </p>
              <LocationSelect
                value=""
                onValueChange={(v) => v && void execute(v)}
                placeholder="Localização de destino…"
              />
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => setSelection(null)}
                disabled={transferItems.isPending}
              >
                <X className="mr-2 h-4 w-4" /> Cancelar leitura
              </Button>
            </div>
            {transferItems.isPending && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> A transferir…
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4" /> Transferências desta sessão ({history.length})
          </CardTitle>
          {!!origin && (
            <Button variant="ghost" size="sm" onClick={() => { setOrigin(''); setSelection(null); }}>
              <RotateCcw className="mr-2 h-3.5 w-3.5" /> Mudar origem
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-1">
          {history.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
              Ainda não transferiu nada nesta sessão.
            </p>
          ) : (
            history.map((h) => (
              <p key={h.id} className="truncate rounded-md border bg-muted/40 p-2 text-xs">
                {h.text}
              </p>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
