import { useCallback, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Loader2, Printer, Download, Eye, X, Search, Check, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { ScanInput } from '@/components/scanner/ScanInput';
import { printLabels, type LabelItem, type LabelFormat } from '@/lib/scanner/labels';
import { colisCode } from '@/lib/scanner/commands';
import type { GcCompraDetailResponse, GcCompraHeader } from '@/types/purchases';

interface Line {
  key: string;
  /** Código vindo do Gestão Click (pode ser vazio). */
  gcCode: string;
  /** Código a usar nas etiquetas / no cadastro (editável). */
  code: string;
  name: string;
  quantity: number;
  productId: string | null;
  totalColis: number;
  registered: boolean;
  saving?: boolean;
}

const clean = (v: string) => (v || '').trim();

export function PurchaseLabelsModule({ onCommand }: { onCommand?: (raw: string) => boolean }) {
  const [numero, setNumero] = useState('');
  const [loading, setLoading] = useState(false);
  const [compra, setCompra] = useState<GcCompraHeader | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [perColi, setPerColi] = useState(true);
  const [useQuantity, setUseQuantity] = useState(true);
  const [format, setFormat] = useState<LabelFormat>('ql700');
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  /** Procura os códigos na base de contagem e devolve o que está cadastrado. */
  const matchProducts = useCallback(async (codes: string[]) => {
    const list = codes.map(clean).filter(Boolean);
    if (!list.length) return new Map<string, { id: string; code: string; total_colis: number }>();
    const { data, error } = await supabase
      .from('products')
      .select('id, code, total_colis')
      .in('code', list);
    if (error) throw error;
    const map = new Map<string, { id: string; code: string; total_colis: number }>();
    (data || []).forEach((p) => map.set(p.code.toLowerCase(), { id: p.id, code: p.code, total_colis: p.total_colis || 1 }));
    return map;
  }, []);

  const loadCompra = useCallback(
    async (raw: string) => {
      const value = clean(raw).replace(/^COMPRA-/i, '');
      if (!value) return;
      setNumero(value);
      setLoading(true);
      setPreviewUrl(null);
      try {
        const { data, error } = await supabase.functions.invoke<GcCompraDetailResponse>(
          'gestaoclick-compra-detail',
          { body: { numero: value } },
        );
        if (error) throw error;
        if (!data?.compra) throw new Error('Compra não encontrada');

        const itens = data.itens || [];
        const map = await matchProducts(itens.map((i) => i.codigo));
        const next: Line[] = itens.map((it, idx) => {
          const code = clean(it.codigo);
          const hit = map.get(code.toLowerCase());
          return {
            key: `${idx}-${code || it.nome}`,
            gcCode: code,
            code: hit?.code || code,
            name: it.nome,
            quantity: Math.max(1, Math.round(it.quantidade || 1)),
            productId: hit?.id ?? null,
            totalColis: hit?.total_colis ?? 1,
            registered: !!hit,
          };
        });
        setCompra(data.compra);
        setLines(next);
        setSelected(Object.fromEntries(next.map((l) => [l.key, true])));
        toast.success(`Compra ${data.compra.numero}: ${next.length} produto(s)`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'erro desconhecido';
        setCompra(null);
        setLines([]);
        toast.error('Não foi possível puxar a compra: ' + msg);
      } finally {
        setLoading(false);
      }
    },
    [matchProducts],
  );

  const handleScan = useCallback(
    (raw: string) => {
      if (onCommand?.(raw)) return;
      void loadCompra(raw);
    },
    [onCommand, loadCompra],
  );

  const patch = (key: string, data: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...data } : l)));

  /** Verifica se o código editado já existe na contagem. */
  const recheck = async (line: Line) => {
    const code = clean(line.code);
    if (!code) {
      toast.error('Indica um código');
      return;
    }
    patch(line.key, { saving: true });
    try {
      const map = await matchProducts([code]);
      const hit = map.get(code.toLowerCase());
      if (hit) {
        patch(line.key, { productId: hit.id, code: hit.code, totalColis: hit.total_colis, registered: true });
        toast.success(`Código ${hit.code} encontrado na contagem`);
      } else {
        patch(line.key, { productId: null, registered: false });
        toast.info(`Código ${code} ainda não está cadastrado`);
      }
    } catch (e: unknown) {
      toast.error('Erro ao verificar: ' + (e instanceof Error ? e.message : 'desconhecido'));
    } finally {
      patch(line.key, { saving: false });
    }
  };

  /** Cadastra o produto na contagem com o nome do Gestão Click e o código indicado. */
  const register = async (line: Line) => {
    const code = clean(line.code);
    const name = clean(line.name);
    if (!code || !name) {
      toast.error('Código e nome são obrigatórios');
      return;
    }
    patch(line.key, { saving: true });
    try {
      const existing = await matchProducts([code]);
      const hit = existing.get(code.toLowerCase());
      if (hit) {
        patch(line.key, { productId: hit.id, code: hit.code, totalColis: hit.total_colis, registered: true });
        toast.info('Esse código já existe — produto associado');
        return;
      }
      const { data, error } = await supabase
        .from('products')
        .insert({ code, name, category: 'Geral', total_colis: Math.max(1, line.totalColis || 1) })
        .select('id, code, total_colis')
        .single();
      if (error) throw error;
      patch(line.key, {
        productId: data.id,
        code: data.code,
        totalColis: data.total_colis || 1,
        registered: true,
      });
      toast.success(`Produto ${data.code} cadastrado`);
    } catch (e: unknown) {
      toast.error('Erro ao cadastrar: ' + (e instanceof Error ? e.message : 'desconhecido'));
    } finally {
      patch(line.key, { saving: false });
    }
  };

  const selectedLines = useMemo(() => lines.filter((l) => selected[l.key]), [lines, selected]);

  const items = (): LabelItem[] => {
    const out: LabelItem[] = [];
    selectedLines.forEach((l) => {
      const code = clean(l.code);
      if (!code) return;
      const copies = useQuantity ? Math.max(1, l.quantity) : 1;
      const total = Math.max(1, l.totalColis || 1);
      if (!perColi || total <= 1) {
        out.push({ code, title: l.name, subtitle: `Código: ${code}`, copies });
        return;
      }
      for (let n = 1; n <= total; n++) {
        out.push({
          code: colisCode(code, n),
          title: l.name,
          subtitle: `Código: ${code}`,
          extra: [`Coli ${n}/${total}`],
          copies,
        });
      }
    });
    return out;
  };

  const run = async (mode: 'print' | 'download' | 'preview') => {
    const list = items();
    if (!list.length) {
      toast.info('Seleciona pelo menos um produto com código');
      return;
    }
    setBusy(true);
    try {
      const url = await printLabels(list, format, `etiquetas-compra-${compra?.numero || numero}.pdf`, mode);
      if (mode === 'preview' && typeof url === 'string') setPreviewUrl(url);
      if (mode === 'download') toast.success('PDF descarregado');
    } catch (e: unknown) {
      toast.error('Erro ao gerar PDF: ' + (e instanceof Error ? e.message : 'desconhecido'));
    } finally {
      setBusy(false);
    }
  };

  const registeredCount = lines.filter((l) => l.registered).length;

  return (
    <div className="space-y-3">
      <ScanInput
        onScan={handleScan}
        label="Ler ou escrever o número da compra"
        placeholder="Nº da compra do Gestão Click…"
      />

      <div className="flex gap-2">
        <Input
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void loadCompra(numero);
          }}
          placeholder="Nº da compra"
        />
        <Button onClick={() => void loadCompra(numero)} disabled={loading || !clean(numero)}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
          Puxar
        </Button>
      </div>

      {compra && (
        <Card>
          <CardContent className="space-y-1 p-3">
            <p className="text-sm font-semibold">Compra {compra.numero}</p>
            <p className="text-[11px] text-muted-foreground">
              {compra.fornecedor_nome || 'Fornecedor —'} · {compra.data || 's/ data'} · {compra.situacao || '—'}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Badge variant="secondary">{lines.length} produtos</Badge>
              <Badge>{registeredCount} cadastrados</Badge>
              {lines.length - registeredCount > 0 && (
                <Badge variant="destructive">{lines.length - registeredCount} por cadastrar</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {lines.length > 0 && (
        <>
          <div className="space-y-2 rounded-md border px-3 py-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium">Etiqueta por coli</p>
                <p className="text-[11px] text-muted-foreground">Gera um código por coli (ex.: ABC-C1)</p>
              </div>
              <Switch checked={perColi} onCheckedChange={setPerColi} aria-label="Etiqueta por coli" />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium">Usar quantidade da compra</p>
                <p className="text-[11px] text-muted-foreground">Uma etiqueta por unidade comprada</p>
              </div>
              <Switch checked={useQuantity} onCheckedChange={setUseQuantity} aria-label="Usar quantidade da compra" />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Badge variant="secondary">{selectedLines.length} selecionados</Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const all = lines.every((l) => selected[l.key]);
                setSelected(Object.fromEntries(lines.map((l) => [l.key, !all])));
              }}
            >
              {lines.every((l) => selected[l.key]) ? 'Limpar' : 'Selecionar tudo'}
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[46vh]">
                <ul className="divide-y">
                  {lines.map((l) => (
                    <li key={l.key} className="space-y-2 px-3 py-2.5">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={!!selected[l.key]}
                          onCheckedChange={() => setSelected((s) => ({ ...s, [l.key]: !s[l.key] }))}
                          className="mt-1"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium leading-tight">{l.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            Qtd: {l.quantity}
                            {l.gcCode ? ` · GC: ${l.gcCode}` : ' · sem código no GC'}
                            {l.registered ? ` · ${l.totalColis} coli(s)` : ''}
                          </p>
                        </div>
                        <Badge variant={l.registered ? 'default' : 'destructive'} className="shrink-0 text-[10px]">
                          {l.registered ? 'Cadastrado' : 'Por cadastrar'}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-2 pl-7">
                        <Input
                          value={l.code}
                          onChange={(e) => patch(l.key, { code: e.target.value, registered: false, productId: null })}
                          placeholder="Código do produto"
                          className="h-8 text-xs"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 shrink-0"
                          onClick={() => void recheck(l)}
                          disabled={l.saving}
                        >
                          {l.saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        </Button>
                        {!l.registered && (
                          <Button
                            size="sm"
                            className="h-8 shrink-0"
                            onClick={() => void register(l)}
                            disabled={l.saving}
                          >
                            <Plus className="mr-1 h-3.5 w-3.5" />
                            Cadastrar
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Button variant={format === 'ql700' ? 'default' : 'outline'} size="sm" className="flex-1" onClick={() => setFormat('ql700')}>
              QL-700 62x29
            </Button>
            <Button variant={format === 'a4' ? 'default' : 'outline'} size="sm" className="flex-1" onClick={() => setFormat('a4')}>
              Folha A4
            </Button>
            <Button variant={format === 'thermal' ? 'default' : 'outline'} size="sm" className="flex-1" onClick={() => setFormat('thermal')}>
              Térmica 100x50
            </Button>
          </div>

          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => run('print')} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
              Imprimir etiquetas
            </Button>
            <Button variant="outline" onClick={() => run('preview')} disabled={busy} aria-label="Pré-visualizar">
              <Eye className="h-4 w-4" />
            </Button>
            <Button variant="outline" onClick={() => run('download')} disabled={busy} aria-label="Descarregar">
              <Download className="h-4 w-4" />
            </Button>
          </div>

          {previewUrl && (
            <Card>
              <CardContent className="space-y-2 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium">Pré-visualização</p>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPreviewUrl(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <iframe title="Pré-visualização de etiquetas" src={previewUrl} className="h-[55vh] w-full rounded border" />
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
