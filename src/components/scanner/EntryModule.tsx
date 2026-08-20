import { useEffect, useRef, useState } from 'react';
import { PackagePlus, Trash2, CheckCircle2, Loader2, Truck, Minus, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScanInput } from './ScanInput';
import { PrintMenu } from './PrintMenu';
import { LocationSelect } from '@/components/counting/LocationSelect';
import { useProductResolver, CONFERENCE_LOCATION } from '@/hooks/useScannerData';
import { supabase } from '@/integrations/supabase/client';
import { colisCode, locationCode, parseScan, type QtyHandler } from '@/lib/scanner/commands';
import { printOperationReceipt, type LabelItem } from '@/lib/scanner/labels';
import { mapDatabaseError } from '@/lib/errorMessages';
import { useQueryClient } from '@tanstack/react-query';
import type { Product } from '@/types/stock';
import { toast } from 'sonner';

interface EntryLine {
  key: string;
  product: Product;
  colis: Record<number, number>;
}

interface Props {
  onCommand?: (raw: string) => boolean;
  registerQtyHandler?: (handler: QtyHandler | null) => void;
}

export function EntryModule({ onCommand, registerQtyHandler }: Props) {
  const resolve = useProductResolver();
  const queryClient = useQueryClient();
  const [lines, setLines] = useState<EntryLine[]>([]);
  const [supplier, setSupplier] = useState('');
  const [reference, setReference] = useState('');
  const [location, setLocation] = useState(CONFERENCE_LOCATION);
  const [saving, setSaving] = useState(false);
  /** Cada leitura conta N unidades. */
  const [step, setStep] = useState(1);
  const [lastTarget, setLastTarget] = useState<{ key: string; coli: number } | null>(null);
  const stepRef = useRef(step);
  stepRef.current = step;

  const setColisQty = (key: string, coli: number, qty: number) => {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, colis: { ...l.colis, [coli]: Math.max(0, qty) } } : l))
    );
    setLastTarget({ key, coli });
  };

  const bumpColis = (key: string, coli: number, delta: number) => {
    setLines((prev) =>
      prev.map((l) =>
        l.key === key ? { ...l, colis: { ...l.colis, [coli]: Math.max(0, (l.colis[coli] || 0) + delta) } } : l
      )
    );
    setLastTarget({ key, coli });
  };

  /** Comandos CMD-QTY aplicados à última linha lida. */
  useEffect(() => {
    if (!registerQtyHandler) return;
    const handler: QtyHandler = ({ delta, set }) => {
      if (!lastTarget) {
        toast.error('Leia primeiro um produto');
        return;
      }
      if (typeof set === 'number') setColisQty(lastTarget.key, lastTarget.coli, set);
      else if (delta) bumpColis(lastTarget.key, lastTarget.coli, delta);
    };
    registerQtyHandler(handler);
    return () => registerQtyHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerQtyHandler, lastTarget]);

  const handleScan = async (raw: string) => {
    if (onCommand?.(raw)) return;
    const parsed = parseScan(raw);

    if (parsed.kind === 'location') {
      setLocation(parsed.value);
      return;
    }

    const results = await resolve(parsed.value);
    if (results.length === 0) {
      toast.error(`Produto não encontrado: ${parsed.value}`);
      return;
    }
    const product = results[0];
    const coli = parsed.colis || 1;
    const inc = Math.max(1, stepRef.current);

    setLines((prev) => {
      const existing = prev.find((l) => l.product.id === product.id);
      if (existing) {
        const next = prev.map((l) =>
          l.product.id === product.id
            ? { ...l, colis: { ...l.colis, [coli]: (l.colis[coli] || 0) + inc } }
            : l
        );
        const line = next.find((l) => l.product.id === product.id)!;
        setLastTarget({ key: line.key, coli });
        toast.success(`${product.name} — coli ${coli}: ${line.colis[coli]} un.`);
        return next;
      }
      const key = `${product.id}-${Date.now()}`;
      setLastTarget({ key, coli });
      toast.success(`${product.name} — coli ${coli}: ${inc} un.`);
      return [...prev, { key, product, colis: { [coli]: inc } }];
    });
  };


  const labels = (): LabelItem[] => {
    const items: LabelItem[] = [];
    lines.forEach((l) => {
      Object.entries(l.colis).forEach(([coli, qty]) => {
        if (qty > 0) {
          items.push({
            code: colisCode(l.product.code, Number(coli)),
            title: l.product.name,
            subtitle: `Coli ${coli} • ${l.product.code}`,
            extra: [location || 'S/L', supplier ? `Fornecedor: ${supplier}` : ''].filter(Boolean),
            copies: qty,
          });
        }
      });
    });
    if (location) items.push({ code: locationCode(location), title: `Localização ${location}`, subtitle: 'Armazém' });
    return items;
  };

  const finalize = async () => {
    const valid = lines.filter((l) => Object.values(l.colis).some((q) => q > 0));
    if (valid.length === 0) {
      toast.error('Adicione produtos à conferência');
      return;
    }

    setSaving(true);
    const failed: string[] = [];
    let ok = 0;

    for (const line of valid) {
      const colis_quantities: Record<string, number> = {};
      Object.entries(line.colis).forEach(([coli, qty]) => {
        if (qty > 0) colis_quantities[coli] = qty;
      });
      try {
        const { error } = await supabase.rpc('register_entry', {
          p_product_id: line.product.id,
          p_colis_quantities: colis_quantities as unknown as never,
          p_location: location || CONFERENCE_LOCATION,
          p_reason: 'Conferência de entrada',
          p_reference: reference || null,
          p_notes: supplier ? `Fornecedor: ${supplier}` : null,
        });
        if (error) throw error;
        if (supplier) {
          await supabase.from('products').update({ last_supplier: supplier }).eq('id', line.product.id);
        }
        ok++;
      } catch (e: any) {
        console.error('register_entry falhou', line.product.code, e);
        failed.push(line.product.code);
      }
    }

    if (ok > 0) {
      await printOperationReceipt({
        title: 'Conferência de Entrada',
        operationCode: `ENT-${Date.now().toString().slice(-8)}`,
        meta: [
          ['Fornecedor', supplier || '—'],
          ['Referência', reference || '—'],
          ['Localização', location || CONFERENCE_LOCATION],
          ['Data', new Date().toLocaleString('pt-PT')],
        ],
        columns: ['Código', 'Produto', 'Coli', 'Quantidade'],
        rows: valid.flatMap((l) =>
          Object.entries(l.colis)
            .filter(([, q]) => q > 0)
            .map(([coli, q]) => [l.product.code, l.product.name, coli, q])
        ),
      });

      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['counts'] });
      queryClient.invalidateQueries({ queryKey: ['recent-movements'] });
      queryClient.invalidateQueries({ queryKey: ['scanner-stock'] });
      toast.success(`Entrada registada: ${ok} produto(s)`);
      setLines([]);
      setReference('');
      setLocation(CONFERENCE_LOCATION);
    }
    if (failed.length) toast.error(`Falha em: ${failed.join(', ')}`);
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <ScanInput onScan={handleScan} label="Ler produto recebido (código ou COD-C1 para coli)" />

      <div className="flex items-center gap-2 rounded-lg border bg-card p-2">
        <span className="text-xs text-muted-foreground">Cada leitura conta</span>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setStep((s) => Math.max(1, s - 1))}>
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <Input
          type="number"
          min={1}
          className="h-8 w-16 text-center"
          value={step}
          onChange={(e) => setStep(Math.max(1, Number(e.target.value) || 1))}
        />
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setStep((s) => s + 1)}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
        <span className="text-xs text-muted-foreground">un.</span>
      </div>


      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Truck className="h-4 w-4" /> Dados da entrada
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          <Input placeholder="Fornecedor" value={supplier} onChange={(e) => setSupplier(e.target.value)} maxLength={120} />
          <Input placeholder="Referência / guia" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} />
          <LocationSelect value={location} onValueChange={setLocation} placeholder="Localização (CONF por defeito)" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <PackagePlus className="h-4 w-4" /> Conferência ({lines.length})
          </CardTitle>
          <PrintMenu getItems={labels} label="Etiquetas" disabled={lines.length === 0} />
        </CardHeader>
        <CardContent className="space-y-2">
          {lines.length === 0 && (
            <p className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
              Leia os produtos recebidos. Sem localização definida ficam em {CONFERENCE_LOCATION}.
            </p>
          )}
          {lines.map((l) => (
            <div key={l.key} className="rounded-lg border p-2">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{l.product.name}</p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">{l.product.code}</p>
                </div>
                <Badge variant="secondary">{Object.values(l.colis).reduce((s, q) => s + q, 0)} un.</Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {Array.from({ length: Math.max(1, l.product.total_colis) }, (_, i) => i + 1).map((coli) => (
                  <div key={coli} className="space-y-1">
                    <span className="text-[10px] text-muted-foreground">Coli {coli}</span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 shrink-0"
                        onClick={() => bumpColis(l.key, coli, -1)}
                        aria-label={`Diminuir coli ${coli}`}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <Input
                        type="number"
                        min={0}
                        className="h-9 text-center"
                        value={l.colis[coli] ?? ''}
                        onFocus={() => setLastTarget({ key: l.key, coli })}
                        onChange={(e) => setColisQty(l.key, coli, Number(e.target.value) || 0)}
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 shrink-0"
                        onClick={() => bumpColis(l.key, coli, 1)}
                        aria-label={`Aumentar coli ${coli}`}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

            </div>
          ))}

          <Button className="w-full" disabled={saving || lines.length === 0} onClick={finalize}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            Concluir conferência e dar entrada
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
