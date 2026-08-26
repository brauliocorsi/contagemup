import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';

import { Loader2, Printer, Download, Eye, X } from 'lucide-react';
import { toast } from 'sonner';
import { printLabels, type LabelItem, type LabelFormat } from '@/lib/scanner/labels';
import { fetchLastEntryDates } from '@/lib/scanner/entryDates';
import { COMMAND_SHEET, colisCode } from '@/lib/scanner/commands';

type Source = 'comandos' | 'produtos';

interface Row {
  id: string;
  code: string;
  title: string;
  subtitle?: string;
  extra?: string[];
  entryDate?: string | null;
}

export function PrintCenterModule() {
  const [source, setSource] = useState<Source>('comandos');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [format, setFormat] = useState<LabelFormat>('ql700');
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [perColi, setPerColi] = useState(true);


  const products = useQuery({
    queryKey: ['print-products', search, perColi],
    enabled: source === 'produtos' && search.trim().length >= 2,
    queryFn: async (): Promise<Row[]> => {
      const term = search.trim();
      const [{ data, error }, { data: cats }] = await Promise.all([
        supabase
          .from('products')
          .select('id, code, name, location, barcode, total_colis, category')
          .or(`code.ilike.%${term}%,name.ilike.%${term}%,barcode.ilike.%${term}%`)
          .order('name')
          .limit(50),
        supabase.from('categories').select('name, colis_names'),
      ]);
      if (error) throw error;

      const colisNamesByCategory = new Map<string, string[]>();
      (cats || []).forEach((c) => {
        const names = c.colis_names && typeof c.colis_names === 'object' ? c.colis_names : {};
        const keys = Object.keys(names as Record<string, unknown>).sort(
          (a, b) => Number(a) - Number(b)
        );
        colisNamesByCategory.set(
          c.name,
          keys.map((k) => String((names as Record<string, unknown>)[k] ?? ''))
        );
      });

      const entryDates = await fetchLastEntryDates((data || []).map((p) => p.id));

      const out: Row[] = [];
      (data || []).forEach((p) => {
        const entryDate = entryDates[p.id] ?? null;

        if (!perColi) {
          const code = (p.barcode || p.code || '').trim();
          if (!code) return;
          out.push({
            id: `prod-${p.id}`,
            code,
            title: p.name,
            subtitle: `Código: ${p.code}`,
            entryDate,
          });
          return;
        }

        const productCode = (p.code || '').trim();
        if (!productCode) return;
        const names = colisNamesByCategory.get(p.category) || [];
        const total = Math.max(p.total_colis || 1, names.length, 1);

        if (total <= 1) {
          out.push({
            id: `prod-${p.id}`,
            code: productCode,
            title: p.name,
            subtitle: `Código: ${productCode}`,
            extra: [names[0] || ''].filter(Boolean),
            entryDate,
          });
          return;
        }

        for (let n = 1; n <= total; n++) {
          out.push({
            id: `prod-${p.id}-c${n}`,
            code: colisCode(productCode, n),
            title: p.name,
            subtitle: `Código: ${productCode}`,
            extra: [names[n - 1] ? `Coli ${n}/${total} - ${names[n - 1]}` : `Coli ${n}/${total}`],
            entryDate,
          });
        }
      });
      return out;
    },
  });


  const commandRows: Row[] = useMemo(
    () =>
      COMMAND_SHEET.map((c) => ({
        id: `cmd-${c.code}`,
        code: c.code,
        title: c.label,
        subtitle: c.description,
      })),
    []
  );

  const loading = source === 'produtos' && products.isFetching;

  const rows: Row[] = useMemo(() => {
    const base = source === 'comandos' ? commandRows : products.data || [];
    if (source === 'produtos') return base;
    const term = search.trim().toLowerCase();
    if (!term) return base;
    return base.filter(
      (r) => r.title.toLowerCase().includes(term) || r.code.toLowerCase().includes(term)
    );
  }, [source, search, commandRows, products.data]);


  const selectedRows = rows.filter((r) => selected[r.id]);
  const toPrint = selectedRows.length ? selectedRows : rows;

  const toggle = (id: string) => setSelected((s) => ({ ...s, [id]: !s[id] }));
  const selectAll = () => {
    const next: Record<string, boolean> = { ...selected };
    const all = rows.every((r) => selected[r.id]);
    rows.forEach((r) => (next[r.id] = !all));
    setSelected(next);
  };

  const items = (): LabelItem[] =>
    toPrint.map((r) =>
      r.entryDate !== undefined
        ? { code: r.code, title: r.title, subtitle: r.subtitle, extra: r.extra, entryDate: r.entryDate }
        : { code: r.code, title: r.title, subtitle: r.subtitle, extra: r.extra }
    );

  const run = async (mode: 'print' | 'download' | 'preview') => {
    const list = items();
    if (!list.length) {
      toast.info('Nada para imprimir');
      return;
    }
    setBusy(true);
    try {
      const filename = `etiquetas-${source}.pdf`;
      const url = await printLabels(list, format, filename, mode);
      if (mode === 'preview' && typeof url === 'string') setPreviewUrl(url);
      if (mode === 'download') toast.success('PDF descarregado');
    } catch (e: any) {
      console.error(e);
      toast.error('Erro ao gerar PDF: ' + (e?.message || 'desconhecido'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <Tabs
        value={source}
        onValueChange={(v) => {
          setSource(v as Source);
          setSearch('');
          setSelected({});
          setPreviewUrl(null);
        }}
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="comandos" className="text-[11px]">Comandos</TabsTrigger>
          <TabsTrigger value="produtos" className="text-[11px]">Produtos</TabsTrigger>
        </TabsList>
        <TabsContent value={source} className="mt-3 space-y-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={source === 'produtos' ? 'Pesquisar produto (código ou nome)…' : 'Filtrar…'}
          />

          {source === 'produtos' && (
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div>
                <p className="text-xs font-medium">Etiqueta por coli</p>
                <p className="text-[11px] text-muted-foreground">
                  Gera um código por coli (ex.: ABC-C1, ABC-C2)
                </p>
              </div>
              <Switch
                checked={perColi}
                onCheckedChange={(v) => {
                  setPerColi(v);
                  setSelected({});
                }}
                aria-label="Etiqueta por coli"
              />
            </div>
          )}



          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary">{rows.length} códigos</Badge>
              {selectedRows.length > 0 && <Badge>{selectedRows.length} selecionados</Badge>}
            </div>
            <Button variant="ghost" size="sm" onClick={selectAll} disabled={!rows.length}>
              {rows.every((r) => selected[r.id]) && rows.length ? 'Limpar' : 'Selecionar tudo'}
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[42vh]">
                {loading ? (
                  <div className="flex h-32 items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                ) : rows.length === 0 ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">
                    {source === 'produtos' && search.trim().length < 2
                      ? 'Escreve pelo menos 2 caracteres para pesquisar.'
                      : 'Sem códigos para mostrar.'}
                  </p>
                ) : (
                  <ul className="divide-y">
                    {rows.map((r) => (
                      <li key={r.id} className="flex items-center gap-3 px-3 py-2.5">
                        <Checkbox checked={!!selected[r.id]} onCheckedChange={() => toggle(r.id)} />
                        <button
                          type="button"
                          onClick={() => toggle(r.id)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <p className="truncate text-sm font-medium">{r.title}</p>
                          <p className="truncate text-[11px] text-muted-foreground">{r.subtitle}</p>
                        </button>
                        <code className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px]">
                          {r.code}
                        </code>
                      </li>
                    ))}
                  </ul>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Button
              variant={format === 'ql700' ? 'default' : 'outline'}
              size="sm"
              className="flex-1"
              onClick={() => setFormat('ql700')}
            >
              QL-700 62x29
            </Button>
            <Button
              variant={format === 'a4' ? 'default' : 'outline'}
              size="sm"
              className="flex-1"
              onClick={() => setFormat('a4')}
            >
              Folha A4
            </Button>
            <Button
              variant={format === 'thermal' ? 'default' : 'outline'}
              size="sm"
              className="flex-1"
              onClick={() => setFormat('thermal')}
            >
              Térmica 100x50
            </Button>
          </div>

          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => run('print')} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
              Imprimir
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
