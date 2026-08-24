import { useEffect, useMemo, useRef, useState } from 'react';
import { Upload, CheckCircle2, Loader2, ClipboardList, Minus, Plus, AlertTriangle, MapPin, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScanInput } from './ScanInput';
import { PrintMenu } from './PrintMenu';
import { useProducts } from '@/hooks/useProducts';
import { parsePickingFile, resolveRows, type ResolvedRow } from '@/lib/stock/pickingImport';
import { supabase } from '@/integrations/supabase/client';
import { parseScan, type QtyHandler } from '@/lib/scanner/commands';
import { printOperationReceipt, type LabelItem } from '@/lib/scanner/labels';
import { mapDatabaseError } from '@/lib/errorMessages';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  useOpenPickingTasks,
  usePickingTaskItems,
  useSavePickingProgress,
  useClosePickingTask,
  type PickingTask,
} from '@/hooks/useScannerPickingTasks';

interface PickLine extends ResolvedRow {
  picked: number;
  /** id do artigo da tarefa (quando o picking vem das Notas de Separação) */
  itemId?: string;
  locations?: string | null;
}

interface Props {
  onCommand?: (raw: string) => boolean;
  registerQtyHandler?: (handler: QtyHandler | null) => void;
}

export function PickingModule({ onCommand, registerQtyHandler }: Props) {
  const { products } = useProducts();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [lines, setLines] = useState<PickLine[]>([]);
  const [reference, setReference] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(1);
  const [lastKey, setLastKey] = useState<string | null>(null);
  const [task, setTask] = useState<PickingTask | null>(null);
  const stepRef = useRef(step);
  stepRef.current = step;

  const { data: openTasks = [], isLoading: loadingTasks } = useOpenPickingTasks();
  const { data: taskItems } = usePickingTaskItems(task?.id ?? null);
  const saveProgress = useSavePickingProgress();
  const closeTask = useClosePickingTask();

  /** Carrega os artigos da tarefa escolhida (com o progresso já gravado). */
  useEffect(() => {
    if (!task || !taskItems) return;
    setLines(
      taskItems.map((it) => ({
        key: it.id,
        itemId: it.id,
        code: it.product_code,
        name: it.product_name,
        quantity: it.requested_quantity,
        details: it.details,
        orders: it.orders,
        locations: it.locations,
        lines: [],
        product: products.find((p) => p.id === it.product_id) ?? null,
        candidates: [],
        method: null,
        status: it.product_id ? 'ready' : 'missing',
        available: 0,
        picked: it.picked_quantity,
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id, taskItems, products]);

  const totals = useMemo(() => {
    const requested = lines.reduce((s, l) => s + l.quantity, 0);
    const picked = lines.reduce((s, l) => s + l.picked, 0);
    return { requested, picked, pct: requested ? Math.round((picked / requested) * 100) : 0 };
  }, [lines]);


  const handleFile = async (file: File) => {
    setLoading(true);
    try {
      const raw = await parsePickingFile(file);
      const resolved = resolveRows(raw, products);
      setTask(null);
      setLines(resolved.map((r) => ({ ...r, picked: 0 })));
      toast.success(`${resolved.length} linha(s) carregadas`);
    } catch (e: any) {
      console.error(e);
      toast.error('Erro ao ler ficheiro: ' + (e.message || ''));
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const linesRef = useRef<PickLine[]>(lines);
  linesRef.current = lines;

  /** Grava o progresso no servidor quando o picking veio de uma tarefa. */

  const persist = (line: PickLine | undefined, picked: number) => {
    if (!task || !line?.itemId) return;
    saveProgress.mutate({ taskId: task.id, itemId: line.itemId, picked });
  };

  const setPicked = (key: string, value: number) => {
    const current = linesRef.current.find((l) => l.key === key);
    if (!current) return;
    const next = Math.max(0, Math.min(current.quantity, value));
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, picked: next } : l)));
    setLastKey(key);
    persist(current, next);
  };

  const bump = (key: string, delta: number) => {
    const current = linesRef.current.find((l) => l.key === key);
    if (!current) return;
    setPicked(key, current.picked + delta);
  };



  /** Comandos CMD-QTY sobre a última linha conferida. */
  useEffect(() => {
    if (!registerQtyHandler) return;
    const handler: QtyHandler = ({ delta, set }) => {
      if (!lastKey) {
        toast.error('Leia primeiro um produto da lista');
        return;
      }
      if (typeof set === 'number') setPicked(lastKey, set);
      else if (delta) bump(lastKey, delta);
    };
    registerQtyHandler(handler);
    return () => registerQtyHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerQtyHandler, lastKey]);

  const handleScan = (raw: string) => {
    if (onCommand?.(raw)) return;
    const parsed = parseScan(raw);
    const code = parsed.value.trim().toLowerCase();
    const match = lines.find(
      (l) =>
        l.code.trim().toLowerCase() === code ||
        l.product?.code.trim().toLowerCase() === code ||
        (l.product?.supplier_code || '').trim().toLowerCase() === code ||
        l.name.trim().toLowerCase() === code
    );

    if (!match) {
      toast.error(`"${parsed.value}" não está nesta lista de picking`);
      return;
    }
    if (match.picked >= match.quantity) {
      toast.warning(`${match.name} já está completo (${match.picked}/${match.quantity})`);
      return;
    }
    const inc = Math.max(1, stepRef.current);
    const next = Math.min(match.quantity, match.picked + inc);
    setPicked(match.key, next);
    toast.success(`${match.name}: ${next}/${match.quantity}`);
  };

  const labels = (): LabelItem[] =>
    lines.map((l) => ({
      code: l.product?.code || l.code || l.name,
      title: l.name,
      subtitle: `Qtd: ${l.quantity}${l.details ? ` • ${l.details}` : ''}`,
      extra: [l.orders ? `Encomendas: ${l.orders}` : ''].filter(Boolean),
      copies: l.quantity,
    }));

  const finalize = async () => {
    const items = lines
      .filter((l) => l.picked > 0 && l.product)
      .map((l) => ({
        product_id: l.product!.id,
        is_complete_set: true,
        set_quantity: l.picked,
        colis_quantities: {},
        location_selections: [],
      }));

    if (items.length === 0) {
      toast.error('Nenhuma linha conferida com produto registado');
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('commit_exit_cart', {
        p_items: items as unknown as never,
        p_reason: 'Venda',
        p_reference: reference || null,
        p_notes: 'Picking via scanner',
      });
      if (error) throw error;
      const result = data as unknown as { fully_fulfilled: boolean };

      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['counts'] });
      queryClient.invalidateQueries({ queryKey: ['recent-movements'] });

      await printOperationReceipt({
        title: 'Picking de Saída',
        operationCode: `PICK-${Date.now().toString().slice(-8)}`,
        meta: [
          ['Referência', reference || '—'],
          ['Data', new Date().toLocaleString('pt-PT')],
          ['Linhas', String(items.length)],
          ['Unidades', String(totals.picked)],
        ],
        columns: ['Código', 'Produto', 'Pedido', 'Conferido'],
        rows: lines
          .filter((l) => l.picked > 0)
          .map((l) => [l.product?.code || l.code, l.name, l.quantity, l.picked]),
      });

      if (task) {
        await closeTask.mutateAsync({ taskId: task.id, status: 'completed' });
        setTask(null);
      }

      toast.success(result?.fully_fulfilled ? 'Saída registada' : 'Saída registada parcialmente');
      setLines([]);
      setReference('');

    } catch (e: any) {
      console.error(e);
      toast.error('Erro ao registar saída: ' + mapDatabaseError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <ScanInput onScan={handleScan} label="Conferir produto da lista" />

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
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ClipboardList className="h-4 w-4" /> Lista de picking
          </CardTitle>
          <div className="flex gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Carregar
            </Button>
            <PrintMenu getItems={labels} label="Etiquetas" disabled={lines.length === 0} />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {lines.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
              Carregue um ficheiro de picking (.xlsx) para começar a conferência.
            </p>
          ) : (
            <>
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Conferido</span>
                  <span>{totals.picked}/{totals.requested} un.</span>
                </div>
                <Progress value={totals.pct} />
              </div>

              <Input
                placeholder="Referência da saída (opcional)"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                maxLength={80}
              />

              <div className="space-y-2">
                {lines.map((l) => {
                  const done = l.picked >= l.quantity;
                  return (
                    <div
                      key={l.key}
                      className={`rounded-lg border p-2 ${done ? 'border-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/20' : ''}`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium">{l.name}</p>
                          <p className="truncate font-mono text-[11px] text-muted-foreground">
                            {l.product?.code || l.code || 'sem código'}
                            {l.details ? ` • ${l.details}` : ''}
                          </p>
                          {!l.product && (
                            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-amber-600">
                              <AlertTriangle className="h-3 w-3" /> não registado no sistema
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => bump(l.key, -1)}>
                            <Minus className="h-3.5 w-3.5" />
                          </Button>
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              min={0}
                              max={l.quantity}
                              className="h-8 w-16 text-center"
                              value={l.picked}
                              onFocus={() => setLastKey(l.key)}
                              onChange={(e) => setPicked(l.key, Number(e.target.value) || 0)}
                            />
                            <Badge variant={done ? 'default' : 'secondary'} className="min-w-10 justify-center">
                              /{l.quantity}
                            </Badge>
                          </div>
                          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => bump(l.key, 1)}>
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <Button className="w-full" disabled={saving || totals.picked === 0} onClick={finalize}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Concluir picking e dar saída
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
