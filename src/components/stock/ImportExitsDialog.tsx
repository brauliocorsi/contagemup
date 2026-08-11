import { useCallback, useMemo, useState } from 'react';
import {
  Upload, FileSpreadsheet, X, CheckCircle2, AlertTriangle, HelpCircle, PackagePlus, Loader2,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useProducts } from '@/hooks/useProducts';
import { useCategories } from '@/hooks/useCategories';
import {
  parsePickingFile, resolveRows, isStockRow, methodLabel,
  type RawPickingRow, type ResolvedRow,
} from '@/lib/stock/pickingImport';
import type { Product } from '@/types/stock';

export interface ImportedExitLine {
  product_id: string;
  product_code: string;
  product_name: string;
  quantity: number;
  orders: string | null;
}

interface ImportExitsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (lines: ImportedExitLine[], reference: string, notes: string) => void;
}

export function ImportExitsDialog({ open, onOpenChange, onConfirm }: ImportExitsDialogProps) {
  const { products, createProduct } = useProducts();
  const { categories } = useCategories();

  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ResolvedRow[]>([]);
  const [skipped, setSkipped] = useState<RawPickingRow[]>([]);
  const [dragging, setDragging] = useState(false);

  const reset = useCallback(() => {
    setFileName(null); setRows([]); setSkipped([]); setError(null);
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setParsing(true); setError(null); setFileName(file.name);
    try {
      const raw = await parsePickingFile(file);
      if (raw.length === 0) throw new Error('Nenhuma linha válida encontrada no ficheiro.');
      const stockRows = raw.filter(isStockRow);
      setSkipped(raw.filter(r => !isStockRow(r)));
      setRows(resolveRows(stockRows, products));
      if (stockRows.length === 0) {
        setError('O ficheiro não tem linhas marcadas como "stock".');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao ler o ficheiro');
      setRows([]); setSkipped([]);
    } finally {
      setParsing(false);
    }
  }, [products]);

  const patchRow = useCallback((key: string, product: Product) => {
    setRows(prev => prev.map(r => {
      if (r.key !== key) return r;
      const available = product.current_stock ?? 0;
      return {
        ...r,
        product,
        candidates: [product],
        status: available < r.quantity ? 'insufficient' : 'ready',
        available,
      };
    }));
  }, []);

  const groups = useMemo(() => ({
    ready: rows.filter(r => r.status === 'ready'),
    insufficient: rows.filter(r => r.status === 'insufficient'),
    ambiguous: rows.filter(r => r.status === 'ambiguous'),
    missing: rows.filter(r => r.status === 'missing'),
  }), [rows]);

  const resolvable = useMemo(
    () => rows.filter(r => r.product !== null),
    [rows],
  );

  const handleConfirm = () => {
    const lines: ImportedExitLine[] = resolvable.map(r => ({
      product_id: r.product!.id,
      product_code: r.product!.code,
      product_name: r.product!.name,
      quantity: r.quantity,
      orders: r.orders,
    }));
    if (lines.length === 0) { toast.error('Nada para adicionar ao carrinho'); return; }
    const reference = Array.from(new Set(
      lines.flatMap(l => (l.orders || '').split(',').map(s => s.trim()).filter(Boolean)),
    )).join(', ');
    const notes = lines
      .filter(l => l.orders)
      .map(l => `${l.product_code || l.product_name}: ${l.quantity} un. (enc. ${l.orders})`)
      .join(' | ');
    onConfirm(lines, reference, notes);
    onOpenChange(false);
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Importar ficheiro de saídas
          </DialogTitle>
          <DialogDescription>
            Excel/CSV com colunas de código, nome do produto e quantidade. Validação por código e por nome.
          </DialogDescription>
        </DialogHeader>

        {!fileName ? (
          <div
            onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
            className={cn(
              'border-2 border-dashed rounded-lg p-10 text-center transition-colors',
              dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25',
            )}
          >
            <input
              type="file" accept=".csv,.xlsx,.xls" className="hidden" id="exit-file-upload"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            <label htmlFor="exit-file-upload" className="cursor-pointer">
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm font-medium">Arraste um ficheiro ou clique para selecionar</p>
              <p className="text-xs text-muted-foreground mt-1">Formatos: .xlsx, .xls, .csv</p>
            </label>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-2 min-w-0">
                {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />}
                <span className="text-sm font-medium truncate">{fileName}</span>
              </div>
              <Button variant="ghost" size="icon" onClick={reset}><X className="h-4 w-4" /></Button>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-destructive text-sm">
                <AlertTriangle className="h-4 w-4" /> {error}
              </div>
            )}

            {rows.length > 0 && (
              <>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge className="bg-emerald-600 hover:bg-emerald-600">{groups.ready.length} prontos</Badge>
                  <Badge variant="destructive">{groups.insufficient.length} sem stock suficiente</Badge>
                  <Badge variant="secondary">{groups.ambiguous.length} ambíguos</Badge>
                  <Badge variant="outline">{groups.missing.length} não registados</Badge>
                  {skipped.length > 0 && <Badge variant="outline">{skipped.length} linhas "encomendar" ignoradas</Badge>}
                </div>

                <ScrollArea className="h-[420px] pr-3">
                  <div className="space-y-2">
                    {rows.map(row => (
                      <RowCard
                        key={row.key}
                        row={row}
                        products={products}
                        categories={categories.map(c => c.name)}
                        onResolve={(p) => patchRow(row.key, p)}
                        onCreate={createProduct}
                      />
                    ))}

                    {skipped.length > 0 && (
                      <div className="pt-3">
                        <p className="text-xs font-medium text-muted-foreground mb-2">
                          Linhas informativas (encomendar) — não entram no carrinho
                        </p>
                        {skipped.map((s, i) => (
                          <div key={i} className="text-xs text-muted-foreground py-1 border-b last:border-0">
                            {s.name} · {s.quantity} un. {s.orders ? `· enc. ${s.orders}` : ''}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={resolvable.length === 0}>
            Adicionar {resolvable.length} produto{resolvable.length === 1 ? '' : 's'} ao carrinho
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

interface RowCardProps {
  row: ResolvedRow;
  products: Product[];
  categories: string[];
  onResolve: (p: Product) => void;
  onCreate: ReturnType<typeof useProducts>['createProduct'];
}

function RowCard({ row, products, categories, onResolve, onCreate }: RowCardProps) {
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [code, setCode] = useState(row.code);
  const [name, setName] = useState(row.name);
  const [category, setCategory] = useState(categories[0] || 'Geral');
  const [colis, setColis] = useState('1');
  const [manualSearch, setManualSearch] = useState('');

  const styles: Record<ResolvedRow['status'], string> = {
    ready: 'border-emerald-500/30 bg-emerald-500/5',
    insufficient: 'border-destructive/30 bg-destructive/5',
    ambiguous: 'border-amber-500/30 bg-amber-500/5',
    missing: 'border-muted-foreground/30 bg-muted/40',
  };

  const icon = {
    ready: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
    insufficient: <AlertTriangle className="h-4 w-4 text-destructive" />,
    ambiguous: <HelpCircle className="h-4 w-4 text-amber-600" />,
    missing: <PackagePlus className="h-4 w-4 text-muted-foreground" />,
  }[row.status];

  const searchResults = useMemo(() => {
    const t = manualSearch.toLowerCase().trim();
    if (!t) return [];
    return products
      .filter(p => p.code.toLowerCase().includes(t) || p.name.toLowerCase().includes(t))
      .slice(0, 8);
  }, [manualSearch, products]);

  const handleCreate = async () => {
    if (!code.trim() || !name.trim()) { toast.error('Código e nome são obrigatórios'); return; }
    setCreating(true);
    const created = await onCreate({
      code: code.trim(),
      name: name.trim(),
      category,
      total_colis: Math.max(1, parseInt(colis, 10) || 1),
      description: null,
    });
    setCreating(false);
    if (created) { onResolve(created); setShowForm(false); }
  };

  return (
    <div className={cn('rounded-lg border p-3 space-y-2', styles[row.status])}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          {icon}
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{row.product?.name ?? row.name}</p>
            <p className="text-xs text-muted-foreground font-mono truncate">
              {row.product?.code || row.code || 'sem código'}
              {row.orders ? ` · enc. ${row.orders}` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Badge variant="secondary">{row.quantity} un.</Badge>
          {row.product && (
            <span className={cn('text-xs', row.available < row.quantity ? 'text-destructive' : 'text-muted-foreground')}>
              stock {row.available}
            </span>
          )}
          {row.product && (
            <span className="text-[10px] text-muted-foreground">{methodLabel(row.method)}</span>
          )}
        </div>
      </div>

      {row.status === 'ambiguous' && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Vários produtos compatíveis — escolha um:</p>
          {row.candidates.slice(0, 6).map(c => (
            <button
              key={c.id}
              onClick={() => onResolve(c)}
              className="w-full text-left text-xs rounded border bg-background px-2 py-1 hover:bg-accent"
            >
              <span className="font-mono">{c.code}</span> · {c.name} · stock {c.current_stock ?? 0}
            </button>
          ))}
        </div>
      )}

      {row.status === 'missing' && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              className="h-8 text-xs"
              placeholder="Procurar produto existente…"
              value={manualSearch}
              onChange={(e) => setManualSearch(e.target.value)}
            />
            <Button size="sm" variant="outline" className="h-8" onClick={() => setShowForm(v => !v)}>
              <PackagePlus className="h-3.5 w-3.5 mr-1" /> Criar
            </Button>
          </div>
          {searchResults.map(c => (
            <button
              key={c.id}
              onClick={() => onResolve(c)}
              className="w-full text-left text-xs rounded border bg-background px-2 py-1 hover:bg-accent"
            >
              <span className="font-mono">{c.code}</span> · {c.name} · stock {c.current_stock ?? 0}
            </button>
          ))}

          {showForm && (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="space-y-1">
                <Label className="text-xs">Código</Label>
                <Input className="h-8 text-xs" value={code} onChange={(e) => setCode(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Nome</Label>
                <Input className="h-8 text-xs" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Categoria</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Nº de colis</Label>
                <Input className="h-8 text-xs" type="number" min={1} value={colis} onChange={(e) => setColis(e.target.value)} />
              </div>
              <div className="col-span-2">
                <Button size="sm" className="h-8 w-full" onClick={handleCreate} disabled={creating}>
                  {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                  Criar produto e usar
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
