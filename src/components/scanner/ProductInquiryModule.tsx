import { useMemo, useState } from 'react';
import { Package, MapPin, Boxes, ShoppingCart, Loader2, Link2, X, Warehouse } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScanInput } from './ScanInput';
import { PrintMenu } from './PrintMenu';
import {
  useProductResolver,
  useProductStockDetail,
  useLinkBarcode,
  useLocationStock,
} from '@/hooks/useScannerData';
import { useProductSales } from '@/hooks/useProductSales';
import { colisCode, locationCode, parseScan } from '@/lib/scanner/commands';
import type { LabelItem } from '@/lib/scanner/labels';
import type { Product } from '@/types/stock';
import { toast } from 'sonner';

interface Props {
  onCommand?: (raw: string) => boolean;
}

export function ProductInquiryModule({ onCommand }: Props) {
  const resolve = useProductResolver();
  const [product, setProduct] = useState<Product | null>(null);
  const [candidates, setCandidates] = useState<Product[]>([]);
  const [lastScan, setLastScan] = useState<string>('');
  const [focusColis, setFocusColis] = useState<number | null>(null);
  const [location, setLocation] = useState<string | null>(null);
  const { data: detail, isLoading } = useProductStockDetail(product?.id ?? null);
  const { data: locStock, isLoading: locLoading } = useLocationStock(location);
  const linkBarcode = useLinkBarcode();
  const sales = useProductSales();

  const handleScan = async (raw: string) => {
    if (onCommand?.(raw)) return;
    const parsed = parseScan(raw);
    setLastScan(parsed.value);

    if (parsed.kind === 'location') {
      setProduct(null);
      setCandidates([]);
      setFocusColis(null);
      setLocation(parsed.value.toUpperCase());
      toast.success(`Localização ${parsed.value.toUpperCase()}`);
      return;
    }

    const results = await resolve(parsed.value);
    if (results.length === 0) {
      setProduct(null);
      setCandidates([]);
      toast.error(`Sem resultados para "${parsed.value}"`);
      return;
    }
    setLocation(null);
    setFocusColis(parsed.colis ?? null);
    if (results.length === 1) {
      setProduct(results[0]);
      setCandidates([]);
    } else {
      setProduct(null);
      setCandidates(results);
    }
  };

  const reserved = useMemo(() => {
    if (!product) return 0;
    const vendas = sales.getSalesForProduct(product.code);
    let total = 0;
    vendas.forEach((v) => {
      v.produtos.forEach((p) => {
        if ((p.codigo || '').trim().toLowerCase() === product.code.trim().toLowerCase()) {
          total += Number(p.quantidade) || 0;
        }
      });
    });
    return total;
  }, [product, sales]);

  /** Resumo de localizações do produto (para visão rápida). */
  const locationSummary = useMemo(() => {
    if (!detail) return [] as Array<{ location: string; quantity: number; colis: number[] }>;
    const map = new Map<string, { location: string; quantity: number; colis: Set<number> }>();
    detail.rows.forEach((r) => {
      const key = r.location || 'Sem localização';
      const cur = map.get(key) || { location: key, quantity: 0, colis: new Set<number>() };
      cur.quantity += r.quantity;
      cur.colis.add(r.colis_number);
      map.set(key, cur);
    });
    return Array.from(map.values())
      .map((v) => ({ location: v.location, quantity: v.quantity, colis: Array.from(v.colis).sort((a, b) => a - b) }))
      .sort((a, b) => b.quantity - a.quantity);
  }, [detail]);

  const labels = (): LabelItem[] => {
    if (!detail) return [];
    const colis = Object.keys(detail.byColis)
      .map(Number)
      .sort((a, b) => a - b);
    const totalColis = Math.max(detail.product.total_colis || 1, colis.length, 1);

    // 1 coli → apenas a etiqueta do produto (sem sufixo -C1)
    if (totalColis <= 1) {
      return [
        { code: detail.product.code, title: detail.product.name, subtitle: `Código: ${detail.product.code}` },
      ];
    }

    return colis.map((coli) => {
      const rows = detail.byColis[coli];
      return {
        code: colisCode(detail.product.code, coli),
        title: detail.product.name,
        subtitle: `Coli ${coli} • ${detail.product.code}`,
        extra: [rows.map((r) => r.location || 'S/L').join(', ')],
      };
    });
  };

  const locationLabels = (): LabelItem[] => {
    if (!locStock) return [];
    return [
      { code: locationCode(locStock.location), title: `Localização ${locStock.location}`, subtitle: `${locStock.totalUnits} un.` },
    ];
  };

  return (
    <div className="space-y-4">
      <ScanInput
        onScan={handleScan}
        label="Ler produto, coli ou localização (LOC-…)"
        placeholder="Código do produto ou localização…"
      />

      {/* ---------- Localização em destaque ---------- */}
      {location && (
        <Card className="border-primary/60 bg-primary/5">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Localização lida</p>
                <CardTitle className="flex items-center gap-2 text-2xl font-bold">
                  <Warehouse className="h-6 w-6 text-primary" />
                  {location}
                </CardTitle>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <PrintMenu getItems={locationLabels} label="Etiqueta" />
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setLocation(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {locLoading && (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {locStock && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border bg-background p-3 text-center">
                    <p className="text-[11px] text-muted-foreground">Produtos</p>
                    <p className="text-xl font-bold">{locStock.products}</p>
                  </div>
                  <div className="rounded-lg border bg-background p-3 text-center">
                    <p className="text-[11px] text-muted-foreground">Unidades</p>
                    <p className="text-xl font-bold">{locStock.totalUnits}</p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  {locStock.rows.map((r) => (
                    <button
                      key={r.id}
                      className="flex w-full items-center gap-2 rounded-lg border bg-background p-2.5 text-left text-xs hover:bg-muted/60"
                      onClick={async () => {
                        const res = await resolve(r.product_code);
                        if (res[0]) {
                          setLocation(null);
                          setFocusColis(r.colis_number);
                          setProduct(res[0]);
                        }
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{r.product_name}</p>
                        <p className="truncate font-mono text-[11px] text-muted-foreground">{r.product_code}</p>
                      </div>
                      <Badge variant="outline" className="shrink-0">Coli {r.colis_number}</Badge>
                      <Badge variant="secondary" className="shrink-0">{r.quantity} un.</Badge>
                    </button>
                  ))}
                  {locStock.rows.length === 0 && (
                    <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                      Sem stock nesta localização.
                    </p>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {candidates.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Vários resultados — escolher</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {candidates.map((c) => (
              <button
                key={c.id}
                className="w-full rounded-lg border p-3 text-left hover:bg-muted/60"
                onClick={() => {
                  setProduct(c);
                  setCandidates([]);
                }}
              >
                <p className="text-sm font-medium">{c.name}</p>
                <p className="font-mono text-xs text-muted-foreground">{c.code}</p>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {detail && (
        <Card className="border-primary/60">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="text-base leading-tight">{detail.product.name}</CardTitle>
                <p className="font-mono text-xs text-muted-foreground">{detail.product.code}</p>
              </div>
              <PrintMenu getItems={labels} label="Etiquetas" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border bg-muted/40 p-3 text-center">
                <p className="text-[11px] text-muted-foreground">Stock (sets)</p>
                <p className={`text-xl font-bold ${detail.product.current_stock < 0 ? 'text-destructive' : ''}`}>
                  {detail.product.current_stock}
                </p>
              </div>
              <div className="rounded-lg border bg-muted/40 p-3 text-center">
                <p className="text-[11px] text-muted-foreground">Unidades</p>
                <p className="text-xl font-bold">{detail.total}</p>
              </div>
              <div className="rounded-lg border bg-muted/40 p-3 text-center">
                <p className="text-[11px] text-muted-foreground">Colis</p>
                <p className="text-xl font-bold">{detail.product.total_colis}</p>
              </div>
            </div>

            {/* Onde está: resumo por localização */}
            {locationSummary.length > 0 && (
              <div className="space-y-1.5 rounded-lg border p-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Warehouse className="h-4 w-4" /> Onde está ({locationSummary.length} local(is))
                </p>
                {locationSummary.map((l) => (
                  <button
                    key={l.location}
                    className="flex w-full items-center gap-2 rounded bg-muted/50 px-2 py-1.5 text-left text-xs hover:bg-muted"
                    onClick={() => {
                      if (l.location === 'Sem localização') return;
                      setProduct(null);
                      setLocation(l.location.toUpperCase());
                    }}
                  >
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="truncate font-medium">{l.location}</span>
                    <span className="ml-auto shrink-0 text-muted-foreground">
                      colis {l.colis.join(', ')}
                    </span>
                    <Badge variant="secondary" className="shrink-0">{l.quantity} un.</Badge>
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-2">
              {Object.keys(detail.byColis)
                .map(Number)
                .sort((a, b) => a - b)
                .map((coli) => (
                  <div
                    key={coli}
                    className={`rounded-lg border p-3 ${
                      focusColis === coli ? 'border-primary bg-primary/5 ring-1 ring-primary/40' : ''
                    }`}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <Boxes className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Coli {coli}</span>
                      {focusColis === coli && (
                        <Badge className="text-[10px]">lido</Badge>
                      )}
                      <Badge variant="secondary" className="ml-auto">
                        {detail.byColis[coli].reduce((s, r) => s + r.quantity, 0)} un.
                      </Badge>
                    </div>
                    <div className="space-y-1.5">
                      {detail.byColis[coli].map((r) => (
                        <div key={r.id} className="flex items-center justify-between rounded bg-muted/50 px-2 py-1.5 text-xs">
                          <span className="flex items-center gap-1.5">
                            <MapPin className="h-3 w-3 text-muted-foreground" />
                            {r.location || 'Sem localização'}
                          </span>
                          <span className="font-semibold">{r.quantity}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              {detail.rows.length === 0 && (
                <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                  Sem registos de localização para este produto.
                </p>
              )}
            </div>

            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <ShoppingCart className="h-4 w-4" /> Reservado a clientes
                </span>
                {sales.loaded ? (
                  <Badge variant={reserved > 0 ? 'default' : 'secondary'}>{reserved} un.</Badge>
                ) : (
                  <Button size="sm" variant="outline" disabled={sales.loading} onClick={() => sales.fetchSales()}>
                    {sales.loading ? (
                      <>
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                        {sales.progress.total ? `${sales.progress.current}/${sales.progress.total}` : 'A carregar'}
                      </>
                    ) : (
                      'Ver vendas pendentes'
                    )}
                  </Button>
                )}
              </div>
              {sales.loaded && (
                <p className="text-[11px] text-muted-foreground">
                  {sales.getSalesForProduct(detail.product.code).length} venda(s) em aberto (exclui conferido,
                  confirmado, produto entregue, levantado e cancelado)
                </p>
              )}
              {sales.loaded &&
                sales.getSalesForProduct(detail.product.code).slice(0, 8).map((v) => (
                  <div key={v.venda_id} className="flex items-center justify-between rounded bg-muted/50 px-2 py-1.5 text-xs">
                    <span className="truncate">#{v.codigo} • {v.cliente_nome}</span>
                    <Badge variant="outline" className="ml-2 shrink-0 text-[10px]">{v.situacao}</Badge>
                  </div>
                ))}
            </div>

            {lastScan && lastScan.toLowerCase() !== detail.product.code.toLowerCase() && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                disabled={linkBarcode.isPending}
                onClick={() => linkBarcode.mutate({ productId: detail.product.id, barcode: lastScan })}
              >
                <Link2 className="mr-2 h-4 w-4" />
                Associar "{lastScan}" a este produto
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {!detail && !isLoading && !location && candidates.length === 0 && (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          <Package className="mx-auto mb-2 h-8 w-8 opacity-40" />
          Leia um código de produto ou uma localização (LOC-…) para consultar.
        </div>
      )}
    </div>
  );
}
