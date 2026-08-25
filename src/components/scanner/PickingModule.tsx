import { useEffect, useMemo, useRef, useState } from 'react';
import { Upload, CheckCircle2, Loader2, ClipboardList, Minus, Plus, AlertTriangle, Ban, MapPin, X, Trash2, Package, FileText } from 'lucide-react';
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
  useDeletePickingTask,
  type PickingTask,
} from '@/hooks/useScannerPickingTasks';
import { useAuth } from '@/hooks/useAuth';
import { useTypedLocations } from '@/hooks/useDeliveryNotes';
import { usePickingStockLocations } from '@/hooks/usePickingStockLocations';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

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
  const [groupMode, setGroupMode] = useState<'produto' | 'nota'>('produto');
  const [dock, setDock] = useState('');
  const { data: docks = [] } = useTypedLocations('pre_exit');

  const stepRef = useRef(step);
  stepRef.current = step;

  const { data: openTasks = [], isLoading: loadingTasks } = useOpenPickingTasks();
  const { data: taskItems } = usePickingTaskItems(task?.id ?? null);
  const saveProgress = useSavePickingProgress();
  const closeTask = useClosePickingTask();
  const deleteTask = useDeletePickingTask();
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [taskToRemove, setTaskToRemove] = useState<PickingTask | null>(null);

  const removeTask = async (t: PickingTask, mode: 'cancel' | 'delete') => {
    if (mode === 'delete') await deleteTask.mutateAsync(t.id);
    else await closeTask.mutateAsync({ taskId: t.id, status: 'cancelled' });
    if (task?.id === t.id) {
      setTask(null);
      setLines([]);
    }
    setTaskToRemove(null);
  };

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

  /** Bloqueio: produtos cujo stock está apenas em localizações não-stock (cais, quarentena, viaturas). */
  const productIds = useMemo(
    () => lines.map((l) => l.product?.id).filter((id): id is string => !!id),
    [lines],
  );
  const { data: placements = {} } = usePickingStockLocations(productIds);

  const blockedFor = (l: PickLine): string | null => {
    const p = l.product?.id ? placements[l.product.id] : undefined;
    if (!p?.blocked) return null;
    return p.nonStockLocations.join(', ');
  };
  const blockedForRef = useRef(blockedFor);
  blockedForRef.current = blockedFor;

  const totals = useMemo(() => {
    const requested = lines.reduce((s, l) => s + l.quantity, 0);
    const picked = lines.reduce((s, l) => s + l.picked, 0);
    return { requested, picked, pct: requested ? Math.round((picked / requested) * 100) : 0 };
  }, [lines]);

  /** Agrupamento da lista: por produto (agregado) ou por entrega/nota. */
  const groups = useMemo(() => {
    if (groupMode === 'produto') {
      return [{ title: 'all', lines, requested: totals.requested, picked: totals.picked }];
    }
    const map = new Map<string, PickLine[]>();
    for (const l of lines) {
      const orders = (l.orders || '')
        .split(/[,;]/)
        .map((o) => o.trim())
        .filter(Boolean);
      const keys = orders.length ? orders : ['Sem nota'];
      for (const k of keys) map.set(k, [...(map.get(k) ?? []), l]);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'pt', { numeric: true }))
      .map(([title, ls]) => ({
        title,
        lines: ls,
        requested: ls.reduce((s, l) => s + l.quantity, 0),
        picked: ls.reduce((s, l) => s + l.picked, 0),
      }));
  }, [lines, groupMode, totals]);



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
    const blocked = blockedForRef.current(current);
    if (blocked && value > current.picked) {
      toast.error(
        `${current.name}: stock apenas em ${blocked}. Transfira para uma localização de stock antes de fazer picking.`,
      );
      return;
    }
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
    const blocked = blockedFor(match);
    if (blocked) {
      toast.error(
        `${match.product?.code || match.code}: stock apenas em ${blocked}. Transfira para uma localização de stock antes de fazer picking.`,
      );
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
    const lineItems = lines
      .filter((l) => l.picked > 0 && !blockedFor(l))
      .map((l) => ({
        product_id: l.product?.id ?? null,
        product_code: l.product?.code || l.code || '',
        product_name: l.name,
        details: l.details ?? null,
        order_number: (l.orders || '').split(',')[0]?.trim() || null,
        quantity: l.picked,
      }));

    if (lineItems.length === 0) {
      toast.error(
        lines.some((l) => blockedFor(l))
          ? 'Todos os artigos conferidos têm stock apenas fora de localizações de stock. Faça a transferência primeiro.'
          : 'Nenhuma linha conferida',
      );
      return;
    }
    if (!dock) {
      toast.error('Escolha a localização de pré-saída (cais)');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.rpc('stage_picking_to_dock', {
        p_task_id: task?.id ?? null,
        p_dock_location: dock,
        p_lines: lineItems as unknown as never,
      });
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['counts'] });
      queryClient.invalidateQueries({ queryKey: ['delivery-notes'] });

      await printOperationReceipt({
        title: 'Picking para o cais',
        operationCode: `PICK-${Date.now().toString().slice(-8)}`,
        meta: [
          ['Referência', reference || '—'],
          ['Cais', dock],
          ['Data', new Date().toLocaleString('pt-PT')],
          ['Linhas', String(lineItems.length)],
          ['Unidades', String(totals.picked)],
        ],
        columns: ['Código', 'Produto', 'Nota', 'Conferido'],
        rows: lineItems.map((l) => [l.product_code, l.product_name, l.order_number || '—', l.quantity]),
      });

      if (task) {
        await closeTask.mutateAsync({ taskId: task.id, status: 'completed' });
        setTask(null);
      }

      toast.success(`Artigos movidos para ${dock}. A saída só acontece na confirmação de entrega.`);
      setLines([]);
      setReference('');
    } catch (e: any) {
      console.error(e);
      toast.error('Erro ao enviar para o cais: ' + mapDatabaseError(e));
    } finally {
      setSaving(false);
    }
  };

  const renderLine = (l: PickLine) => {
    const done = l.picked >= l.quantity;
    const blocked = blockedFor(l);
    return (
      <div
        key={l.key}
        className={`rounded-lg border p-2 ${
          blocked
            ? 'border-destructive/50 bg-destructive/5'
            : done
              ? 'border-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/20'
              : ''
        }`}
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">{l.name}</p>
            <p className="truncate font-mono text-[11px] text-muted-foreground">
              {l.product?.code || l.code || 'sem código'}
              {l.details ? ` • ${l.details}` : ''}
            </p>
            {l.orders && (
              <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                <FileText className="h-3 w-3" /> {l.orders}
              </p>
            )}
            {l.locations && (
              <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                <MapPin className="h-3 w-3" /> {l.locations}
              </p>
            )}
            {blocked && (
              <Badge variant="destructive" className="mt-1 max-w-full gap-1 whitespace-normal text-left text-[10px]">
                <Ban className="h-3 w-3 shrink-0" /> Bloqueado — stock só em {blocked}
              </Badge>
            )}
            {!l.product && (
              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-amber-600">
                <AlertTriangle className="h-3 w-3" /> não registado no sistema
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={!!blocked}
              onClick={() => bump(l.key, -1)}
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={0}
                max={l.quantity}
                className="h-8 w-16 text-center"
                value={l.picked}
                disabled={!!blocked}
                onFocus={() => setLastKey(l.key)}
                onChange={(e) => setPicked(l.key, Number(e.target.value) || 0)}
              />
              <Badge variant={done ? 'default' : 'secondary'} className="min-w-10 justify-center">
                /{l.quantity}
              </Badge>
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={!!blocked}
              onClick={() => bump(l.key, 1)}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    );
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
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ClipboardList className="h-4 w-4" /> Picking pendente (Notas de Separação)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {loadingTasks ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : openTasks.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sem listas enviadas para o scanner.</p>
          ) : (
            openTasks.map((t) => {
              const active = task?.id === t.id;
              return (
                <div
                  key={t.id}
                  className={`flex items-center gap-2 rounded-lg border p-2 text-xs transition-colors ${
                    active ? 'border-primary bg-primary/5' : 'hover:border-primary/40'
                  }`}
                >
                  <button
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => {
                      if (active) {
                        setTask(null);
                        setLines([]);
                        return;
                      }
                      setTask(t);
                      setReference(t.reference || t.name);
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{t.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {new Date(t.created_at).toLocaleString('pt-PT')}
                        {t.reference ? ` • ${t.reference}` : ''}
                      </p>
                    </div>
                    <Badge variant={t.status === 'in_progress' ? 'default' : 'secondary'}>
                      {t.status === 'in_progress' ? 'Em curso' : 'Pendente'}
                    </Badge>
                    {active && <X className="h-3.5 w-3.5 text-muted-foreground" />}
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-destructive"
                    aria-label="Remover lista"
                    onClick={() => setTaskToRemove(t)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

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
              Escolha uma lista pendente acima ou carregue um ficheiro de picking (.xlsx).
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

              <Select value={dock} onValueChange={setDock}>
                <SelectTrigger>
                  <SelectValue placeholder="Localização de pré-saída (cais)" />
                </SelectTrigger>
                <SelectContent>
                  {docks.map((d) => (
                    <SelectItem key={d.id} value={d.code}>
                      {d.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                placeholder="Referência do picking (opcional)"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                maxLength={80}
              />

              <div className="flex items-center gap-1 rounded-lg border bg-card p-1">
                <Button
                  variant={groupMode === 'produto' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-8 flex-1 text-xs"
                  onClick={() => setGroupMode('produto')}
                >
                  <Package className="mr-1 h-3.5 w-3.5" /> Por produto
                </Button>
                <Button
                  variant={groupMode === 'nota' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-8 flex-1 text-xs"
                  onClick={() => setGroupMode('nota')}
                >
                  <FileText className="mr-1 h-3.5 w-3.5" /> Por entrega
                </Button>
              </div>

              <div className="space-y-3">
                {groups.map((g) => (
                  <div key={g.title} className="space-y-2">
                    {groupMode === 'nota' && (
                      <div className="flex items-center justify-between rounded-md bg-muted px-2 py-1">
                        <p className="truncate text-xs font-semibold">Entrega {g.title}</p>
                        <Badge variant="secondary" className="text-[10px]">
                          {g.picked}/{g.requested} un.
                        </Badge>
                      </div>
                    )}
                    {g.lines.map((l) => renderLine(l))}
                  </div>
                ))}
              </div>


              <Button className="w-full" disabled={saving || totals.picked === 0 || !dock} onClick={finalize}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Concluir picking e enviar para o cais
              </Button>
              {docks.length === 0 && (
                <p className="text-center text-[11px] text-muted-foreground">
                  Nenhuma localização de pré-saída configurada (Armazém › Configurar › Localizações).
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!taskToRemove} onOpenChange={(o) => !o && setTaskToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover lista de picking?</AlertDialogTitle>
            <AlertDialogDescription>
              "{taskToRemove?.name}" deixa de aparecer no scanner. Cancelar mantém o histórico;
              eliminar remove definitivamente (apenas administradores).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => taskToRemove && removeTask(taskToRemove, 'cancel')}
              disabled={closeTask.isPending}
            >
              Cancelar lista
            </Button>
            <AlertDialogAction
              disabled={!isAdmin || deleteTask.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (taskToRemove) removeTask(taskToRemove, 'delete');
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
