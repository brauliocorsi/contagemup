import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Upload,
  CheckCircle2,
  Loader2,
  ClipboardList,
  Minus,
  Plus,
  AlertTriangle,
  Ban,
  MapPin,
  X,
  Trash2,
  Package,
  FileText,
  Forklift,
  Route,
  Boxes,
  Save,
  CloudUpload,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScanInput } from './ScanInput';
import { PrintMenu } from './PrintMenu';
import { useProducts } from '@/hooks/useProducts';
import { parsePickingFile, resolveRows, type ResolvedRow } from '@/lib/stock/pickingImport';
import { parseScan, type QtyHandler } from '@/lib/scanner/commands';
import { scanFeedback } from '@/lib/scanner/feedback';
import { ScanDock, type LastScan } from './ScanDock';
import { printOperationReceipt, type LabelItem } from '@/lib/scanner/labels';
import { mapDatabaseError } from '@/lib/errorMessages';
import { toast } from 'sonner';
import {
  useOpenPickingTasks,
  usePickingTaskItems,
  useClosePickingTask,
  useDeletePickingTask,
  type PickingTask,
} from '@/hooks/useScannerPickingTasks';
import { useAuth } from '@/hooks/useAuth';
import { useTypedLocations } from '@/hooks/useDeliveryNotes';
import { useWarehouseLocations } from '@/hooks/useWarehouseConfig';
import { usePickingStockLocations } from '@/hooks/usePickingStockLocations';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import {
  usePickingItemColis,
  useStagePickingColis,
  type StageColiLine,
  type StageColiResult,
} from '@/hooks/useColisOperations';
import {
  addColiScan,
  completeSets,
  evaluateColiScan,
  linePending,
  setColiScan,
  slotPending,
  splitColisSuffix,
  type ColiLine,
  type ColiSlot,
} from '@/lib/scanner/coliCounter';
import {
  clearOpDraft,
  loadOpDraft,
  newOpKey,
  purgeForeignOpDrafts,
  saveOpDraft,
  type DraftStatus,
} from '@/lib/scanner/opDraft';

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
  /** id do artigo da tarefa (quando o picking vem das Notas de Separação) */
  itemId?: string;
  locations?: string | null;
  /** encomendas candidatas desta linha */
  orderOptions: string[];
  /** encomenda escolhida (obrigatória para gravar) */
  orderNumber: string;
  /** localização de onde o operador tira fisicamente as peças */
  from: string;
  reason: string;
  note: string;
  /** volumes previstos/separados */
  slots: ColiSlot[];
}

const SHORTAGE_REASONS: Array<{ id: string; label: string }> = [
  { id: 'nao_estava_la', label: 'Não estava lá' },
  { id: 'avariado', label: 'Avariado' },
  { id: 'quantidade_insuficiente', label: 'Quantidade insuficiente' },
  { id: 'localizacao_errada', label: 'Localização errada' },
  { id: 'outro', label: 'Outro' },
];

const firstSuggested = (s?: string | null) =>
  (s || '')
    .split(/[,;/|]/)
    .map((x) => x.trim())
    .filter(Boolean)[0] ?? '';

const splitOrders = (s?: string | null) =>
  (s || '')
    .split(/[,;]/)
    .map((o) => o.trim())
    .filter(Boolean);

/** Conversão para o formato do contador de volumes. */
const toColiLine = (l: PickLine): ColiLine => ({
  key: l.key,
  label: l.name,
  orderNumber: l.orderNumber || null,
  aliases: [l.code, l.product?.code, l.product?.supplier_code, l.name].filter(Boolean) as string[],
  slots: l.slots,
});

interface Props {
  onCommand?: (raw: string) => boolean;
  registerQtyHandler?: (handler: QtyHandler | null) => void;
}

type Choice =
  | { kind: 'linha'; candidates: ColiLine[]; colis?: number }
  | { kind: 'coli'; lineKey: string; options: number[] }
  | null;

export function PickingModule({ onCommand, registerQtyHandler }: Props) {
  const { products } = useProducts();
  const fileRef = useRef<HTMLInputElement>(null);
  const [lines, setLines] = useState<PickLine[]>([]);
  const [reference, setReference] = useState('');
  const [loading, setLoading] = useState(false);
  const [last, setLast] = useState<LastScan | null>(null);
  const [lastKey, setLastKey] = useState<string | null>(null);
  const [task, setTask] = useState<PickingTask | null>(null);
  const [groupMode, setGroupMode] = useState<'rota' | 'produto' | 'nota'>('rota');
  const [dock, setDock] = useState('');
  const [choice, setChoice] = useState<Choice>(null);
  const [status, setStatus] = useState<DraftStatus>('gravado');
  const [result, setResult] = useState<StageColiResult | null>(null);
  const { data: docks = [] } = useTypedLocations('pre_exit');

  const { data: openTasks = [], isLoading: loadingTasks } = useOpenPickingTasks();
  const { data: taskItems } = usePickingTaskItems(task?.id ?? null);
  const itemIds = useMemo(() => (taskItems ?? []).map((i) => i.id), [taskItems]);
  const { data: serverColis = [] } = usePickingItemColis(itemIds);
  const closeTask = useClosePickingTask();
  const deleteTask = useDeletePickingTask();
  const stage = useStagePickingColis();
  const { profile, user } = useAuth();
  const { isWarehouseOperator } = useRoleAccess();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'master';
  const [taskToRemove, setTaskToRemove] = useState<PickingTask | null>(null);

  const context = `picking:${task?.id ?? 'adhoc'}`;
  const opKeyRef = useRef<string>(newOpKey('picking_stage_colis'));

  /** Rascunhos de outra conta não podem sobreviver à troca de operador. */
  useEffect(() => {
    purgeForeignOpDrafts(user?.id ?? null);
  }, [user?.id]);

  const removeTask = async (t: PickingTask, mode: 'cancel' | 'delete') => {
    if (mode === 'delete') await deleteTask.mutateAsync(t.id);
    else await closeTask.mutateAsync({ taskId: t.id, status: 'cancelled' });
    if (task?.id === t.id) {
      setTask(null);
      setLines([]);
    }
    setTaskToRemove(null);
  };

  /** Total de volumes de um produto (mínimo 1). */
  const totalColisOf = useCallback(
    (productId: string | null | undefined, itemId?: string) => {
      const fromServer = serverColis
        .filter((c) => c.item_id === itemId)
        .reduce((m, c) => Math.max(m, c.colis_number), 0);
      const p = products.find((x) => x.id === productId);
      return Math.max(1, p?.total_colis ?? 1, fromServer);
    },
    [products, serverColis],
  );

  /** Carrega os artigos da tarefa com o previsto e o já separado por volume. */
  useEffect(() => {
    if (!task || !taskItems) return;
    const draft = loadOpDraft<{
      opKey: string;
      dock: string;
      scanned: Record<string, Record<number, number>>;
      from: Record<string, string>;
      order: Record<string, string>;
      reason: Record<string, { reason: string; note: string }>;
    }>(user?.id, `picking:${task.id}`);
    if (draft?.opKey) opKeyRef.current = draft.opKey;
    if (draft?.data?.dock) setDock(draft.data.dock);
    setStatus(draft ? draft.status : 'gravado');

    setLines(
      taskItems.map((it) => {
        const total = totalColisOf(it.product_id, it.id);
        const orders = splitOrders(it.orders);
        const slots: ColiSlot[] = Array.from({ length: total }, (_, i) => {
          const n = i + 1;
          const row = serverColis.find((c) => c.item_id === it.id && c.colis_number === n);
          return {
            colis_number: n,
            requested: row?.requested_quantity ?? it.requested_quantity,
            done: row?.picked_quantity ?? 0,
            scanned: draft?.data?.scanned?.[it.id]?.[n] ?? 0,
            location: row?.from_location ?? null,
            evidence: row?.evidence ?? null,
          };
        });
        return {
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
          orderOptions: orders,
          orderNumber: draft?.data?.order?.[it.id] ?? (orders.length === 1 ? orders[0] : ''),
          from:
            draft?.data?.from?.[it.id] ??
            (it as any).picked_location ??
            firstSuggested(it.locations),
          reason: draft?.data?.reason?.[it.id]?.reason ?? (it as any).shortage_reason ?? '',
          note: draft?.data?.reason?.[it.id]?.note ?? (it as any).shortage_notes ?? '',
          slots,
        } as PickLine;
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id, taskItems, serverColis, products, user?.id]);

  /** Guarda o rascunho sempre que há trabalho por enviar. */
  useEffect(() => {
    if (!user?.id || lines.length === 0) return;
    const scanned: Record<string, Record<number, number>> = {};
    const from: Record<string, string> = {};
    const order: Record<string, string> = {};
    const reason: Record<string, { reason: string; note: string }> = {};
    let pendingWork = 0;
    for (const l of lines) {
      const key = l.itemId ?? l.key;
      from[key] = l.from;
      order[key] = l.orderNumber;
      reason[key] = { reason: l.reason, note: l.note };
      for (const s of l.slots) {
        if (s.scanned > 0) {
          scanned[key] = { ...(scanned[key] ?? {}), [s.colis_number]: s.scanned };
          pendingWork += s.scanned;
        }
      }
    }
    saveOpDraft({
      opKey: opKeyRef.current,
      userId: user.id,
      context,
      status: pendingWork > 0 ? (status === 'a_enviar' ? 'a_enviar' : status === 'erro' ? 'erro' : 'por_guardar') : 'gravado',
      updatedAt: Date.now(),
      data: { opKey: opKeyRef.current, dock, scanned, from, order, reason },
    });
    if (pendingWork === 0 && status === 'por_guardar') setStatus('gravado');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, dock, user?.id, context]);

  /** Bloqueio: stock apenas em localizações não-stock (cais, quarentena, viaturas). */
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
    const requested = lines.reduce((s, l) => s + l.slots.reduce((t, x) => t + x.requested, 0), 0);
    const done = lines.reduce(
      (s, l) => s + l.slots.reduce((t, x) => t + x.done + x.scanned, 0),
      0,
    );
    const scanned = lines.reduce((s, l) => s + l.slots.reduce((t, x) => t + x.scanned, 0), 0);
    const sets = lines.reduce((s, l) => s + completeSets(toColiLine(l)), 0);
    const setsRequested = lines.reduce((s, l) => s + l.quantity, 0);
    return {
      requested,
      done,
      scanned,
      sets,
      setsRequested,
      pct: requested ? Math.round((done / requested) * 100) : 0,
    };
  }, [lines]);

  const { locations: whLocations } = useWarehouseLocations();
  const locMeta = useMemo(() => {
    const m = new Map<
      string,
      { aisle: string; aisleOrder: number; levelOrder: number; pos: number; forklift: boolean }
    >();
    for (const l of whLocations) {
      m.set(l.code.trim().toUpperCase(), {
        aisle: l.aisle?.name ?? 'Sem corredor',
        aisleOrder: l.aisle?.display_order ?? 9999,
        levelOrder: l.level?.display_order ?? l.level?.level_number ?? 9999,
        pos: l.position_in_aisle ?? 0,
        forklift: !!l.level?.requires_forklift,
      });
    }
    return m;
  }, [whLocations]);

  const locationCodes = useMemo(
    () => whLocations.map((l) => l.code).sort((a, b) => a.localeCompare(b, 'pt', { numeric: true })),
    [whLocations],
  );

  const metaFor = (l: PickLine) =>
    locMeta.get((l.from || firstSuggested(l.locations)).trim().toUpperCase());
  const forkliftCount = useMemo(
    () => lines.filter((l) => metaFor(l)?.forklift).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines, locMeta],
  );

  const groups = useMemo(() => {
    const totalsOf = (ls: PickLine[]) => ({
      requested: ls.reduce((s, l) => s + l.slots.reduce((t, x) => t + x.requested, 0), 0),
      done: ls.reduce((s, l) => s + l.slots.reduce((t, x) => t + x.done + x.scanned, 0), 0),
    });
    if (groupMode === 'produto') {
      return [{ title: 'all', lines, ...totalsOf(lines) }];
    }
    if (groupMode === 'rota') {
      const sorted = [...lines].sort((a, b) => {
        const ma = metaFor(a);
        const mb = metaFor(b);
        return (
          (ma?.aisleOrder ?? 9999) - (mb?.aisleOrder ?? 9999) ||
          (ma?.levelOrder ?? 9999) - (mb?.levelOrder ?? 9999) ||
          (ma?.pos ?? 0) - (mb?.pos ?? 0) ||
          a.name.localeCompare(b.name, 'pt')
        );
      });
      const map = new Map<string, PickLine[]>();
      for (const l of sorted) {
        const k = metaFor(l)?.aisle ?? 'Sem localização';
        map.set(k, [...(map.get(k) ?? []), l]);
      }
      return [...map.entries()].map(([title, ls]) => ({ title, lines: ls, ...totalsOf(ls) }));
    }
    const map = new Map<string, PickLine[]>();
    for (const l of lines) {
      const keys = l.orderOptions.length ? l.orderOptions : ['Sem nota'];
      for (const k of keys) map.set(k, [...(map.get(k) ?? []), l]);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'pt', { numeric: true }))
      .map(([title, ls]) => ({ title, lines: ls, ...totalsOf(ls) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, groupMode, locMeta]);

  const handleFile = async (file: File) => {
    setLoading(true);
    try {
      const raw = await parsePickingFile(file);
      const resolved = resolveRows(raw, products);
      setTask(null);
      setLines(
        resolved.map((r) => {
          const orders = splitOrders((r as any).orders);
          const total = Math.max(1, r.product?.total_colis ?? 1);
          return {
            ...r,
            orderOptions: orders,
            orderNumber: orders.length === 1 ? orders[0] : '',
            from: firstSuggested((r as any).locations),
            reason: '',
            note: '',
            slots: Array.from({ length: total }, (_, i) => ({
              colis_number: i + 1,
              requested: r.quantity,
              done: 0,
              scanned: 0,
              location: null,
            })),
          } as PickLine;
        }),
      );
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

  /** Aplica uma unidade conferida a um volume (usa sempre o estado atual). */
  const applyScan = useCallback((lineKey: string, colis: number, qty = 1) => {
    let feedbackLine: PickLine | undefined;
    setLines((prev) => {
      const current = prev.find((l) => l.key === lineKey);
      if (!current) return prev;
      const blocked = blockedForRef.current(current);
      if (blocked) {
        toast.error(`${current.name}: stock apenas em ${blocked}. Transfira antes de separar.`);
        return prev;
      }
      const next = addColiScan(prev.map(toColiLine) as unknown as ColiLine[], lineKey, colis, qty);
      const merged = prev.map((l, i) => ({ ...l, slots: next[i].slots }));
      feedbackLine = merged.find((l) => l.key === lineKey);
      return merged;
    });
    setLastKey(lineKey);
    setStatus('por_guardar');
    window.setTimeout(() => {
      const l = feedbackLine;
      if (!l) return;
      const slot = l.slots.find((s) => s.colis_number === colis);
      const sets = completeSets(toColiLine(l));
      scanFeedback(linePending(toColiLine(l)) === 0 ? 'done' : 'ok');
      setLast({
        kind: 'produto',
        title: `${l.name} — volume ${colis}/${l.slots.length}`,
        detail: `${l.product?.code || l.code} • origem ${l.from || 'por indicar'} • enc. ${l.orderNumber || '—'}`,
        quantity: `${(slot?.done ?? 0) + (slot?.scanned ?? 0)}/${slot?.requested ?? 0}`,
        remaining:
          linePending(toColiLine(l)) === 0
            ? `${sets} conjunto(s) completo(s)`
            : `faltam ${linePending(toColiLine(l))} volume(s)`,
      });
    }, 0);
  }, []);

  /** Comandos CMD-QTY sobre o último volume conferido. */
  useEffect(() => {
    if (!registerQtyHandler) return;
    const handler: QtyHandler = ({ delta, set }) => {
      const key = lastKey;
      if (!key) {
        toast.error('Leia primeiro um volume da lista');
        return;
      }
      const line = linesRef.current.find((l) => l.key === key);
      const slot = line?.slots.find((s) => s.scanned > 0) ?? line?.slots[0];
      if (!line || !slot) return;
      if (typeof set === 'number') {
        setLines((prev) => {
          const conv = addColiScan(prev.map(toColiLine), key, slot.colis_number, 0);
          const upd = setColiScan(conv, key, slot.colis_number, set);
          return prev.map((l, i) => ({ ...l, slots: upd[i].slots }));
        });
        setStatus('por_guardar');
      } else if (delta && delta > 0) applyScan(key, slot.colis_number, delta);
      else if (delta) {
        setLines((prev) => {
          const conv = prev.map(toColiLine);
          const upd = setColiScan(conv, key, slot.colis_number, Math.max(0, slot.scanned + delta));
          return prev.map((l, i) => ({ ...l, slots: upd[i].slots }));
        });
      }
    };
    registerQtyHandler(handler);
    return () => registerQtyHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerQtyHandler, lastKey, applyScan]);

  const handleScan = (raw: string) => {
    if (onCommand?.(raw)) return;
    const parsed = parseScan(raw);
    const { base, colis } = splitColisSuffix(parsed.value);
    const fail = (title: string, detail?: string) => {
      scanFeedback('error');
      setLast({ kind: 'erro', title, detail });
      toast.error(detail ? `${title}: ${detail}` : title);
    };

    const current = linesRef.current;
    const outcome = evaluateColiScan(current.map(toColiLine), base, colis);
    switch (outcome.status) {
      case 'desconhecido':
        fail(`"${base}" não está nesta lista de picking`);
        return;
      case 'completo':
        fail(
          current.find((l) => l.key === outcome.lineKey)?.name ?? base,
          colis ? `volume ${colis} já está completo` : 'já está tudo conferido',
        );
        return;
      case 'escolher_linha':
        scanFeedback('error');
        setChoice({ kind: 'linha', candidates: outcome.candidates, colis });
        toast.info('Este artigo está em mais do que uma linha — escolha a encomenda.');
        return;
      case 'escolher_coli':
        scanFeedback('error');
        setChoice({ kind: 'coli', lineKey: outcome.lineKey, options: outcome.options });
        toast.info('Produto de vários volumes — indique qual está a ler.');
        return;
      case 'ok':
        applyScan(outcome.lineKey, outcome.colis);
        return;
    }
  };

  const labels = (): LabelItem[] =>
    lines.map((l) => ({
      code: l.product?.code || l.code || l.name,
      title: l.name,
      subtitle: `Qtd: ${l.quantity}${l.details ? ` • ${l.details}` : ''}`,
      extra: [l.orders ? `Encomendas: ${l.orders}` : ''].filter(Boolean),
      copies: l.quantity,
    }));

  /** Resumo do que vai ser gravado. */
  const commitLines = useMemo((): StageColiLine[] => {
    return lines
      .filter((l) => !blockedFor(l))
      .map((l) => ({
        item_id: l.itemId ?? null,
        product_id: l.product?.id ?? null,
        product_code: l.product?.code || l.code || '',
        product_name: l.name,
        details: l.details ?? null,
        order_number: l.orderNumber,
        quantity: l.quantity,
        shortage_reason: l.reason || null,
        shortage_notes: l.note || null,
        colis: l.slots
          .filter((s) => s.scanned > 0)
          .map((s) => ({
            colis_number: s.colis_number,
            quantity: s.scanned,
            from_location: (l.from || '').trim().toUpperCase(),
          })),
      }))
      .filter((l) => l.colis.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, placements]);

  const finalize = async () => {
    if (!dock) {
      toast.error('Escolha a localização de pré-saída (cais)');
      return;
    }
    if (commitLines.length === 0) {
      toast.error('Nenhum volume conferido');
      return;
    }
    const noOrder = commitLines.find((l) => !l.order_number);
    if (noOrder) {
      toast.error(`Indique a encomenda de "${noOrder.product_name}"`);
      return;
    }
    const noOrigin = commitLines.find((l) => l.colis.some((c) => !c.from_location));
    if (noOrigin) {
      toast.error(`Indique a localização de origem de "${noOrigin.product_name}"`);
      return;
    }
    const missingReason = lines.find((l) => {
      const cl = toColiLine(l);
      const hasWork = l.slots.some((s) => s.scanned > 0);
      return hasWork && completeSets(cl) < l.quantity && !l.reason;
    });
    if (missingReason) {
      toast.error(`Indique o motivo da falta em "${missingReason.name}"`);
      return;
    }

    setStatus('a_enviar');
    try {
      const res = await stage.mutateAsync({
        taskId: task?.id ?? null,
        dock,
        lines: commitLines,
        opKey: opKeyRef.current,
      });
      setResult(res);
      setStatus('gravado');
      clearOpDraft(user?.id, context);
      // chave nova só depois de o servidor confirmar
      opKeyRef.current = newOpKey('picking_stage_colis');

      const short = (res.lines ?? []).filter((l) =>
        (l.pending ?? []).some((p) => (p.pending ?? 0) > 0),
      );
      if (short.length > 0) {
        toast.warning(
          `Ficou pendente em ${short.length} artigo(s): ` +
            short
              .map(
                (l) =>
                  `${l.product_code || l.order_number} faltam ${(l.pending ?? [])
                    .filter((p) => p.pending > 0)
                    .map((p) => `C${p.colis_number}×${p.pending}`)
                    .join(' ')}`,
              )
              .slice(0, 4)
              .join('; '),
        );
      }
      toast.success(
        `${res.volumes_moved} volume(s) movidos para ${res.dock}. A saída só acontece na entrega.`,
      );

      // A impressão usa o resultado confirmado. Falhar a impressão não desfaz o registo.
      try {
        await printOperationReceipt({
          title: 'Picking para o cais (conferência por volume)',
          operationCode: `PICK-${Date.now().toString().slice(-8)}`,
          meta: [
            ['Referência', reference || '—'],
            ['Cais', res.dock],
            ['Data', new Date().toLocaleString('pt-PT')],
            ['Linhas', String((res.lines ?? []).length)],
            ['Volumes', String(res.volumes_moved)],
          ],
          columns: ['Encomenda', 'Código', 'Volumes movidos', 'Conjuntos', 'Pendente'],
          rows: (res.lines ?? []).map((l) => [
            l.order_number,
            l.product_code || '—',
            (l.colis ?? []).map((c) => `C${c.colis_number}×${c.moved} (${c.from_location})`).join(' '),
            `${l.complete_sets}/${l.requested_sets}`,
            (l.pending ?? [])
              .filter((p) => p.pending > 0)
              .map((p) => `C${p.colis_number}×${p.pending}`)
              .join(' ') || '—',
          ]),
        });
      } catch (printErr) {
        console.error(printErr);
        toast.warning('O registo ficou gravado, mas a impressão falhou. Pode reimprimir.');
      }
    } catch (e: any) {
      console.error(e);
      setStatus('erro');
      toast.error('Erro ao enviar para o cais: ' + mapDatabaseError(e), {
        description: 'O trabalho ficou guardado. Volte a confirmar para reenviar a mesma operação.',
      });
    }
  };

  const statusBadge = () => {
    const map: Record<DraftStatus, { label: string; cls: string; icon: typeof Save }> = {
      por_guardar: { label: 'Por guardar', cls: 'border-amber-400 text-amber-700', icon: Save },
      a_enviar: { label: 'A enviar…', cls: 'border-primary text-primary', icon: CloudUpload },
      gravado: { label: 'Gravado', cls: 'border-emerald-400 text-emerald-700', icon: CheckCircle2 },
      erro: { label: 'Erro — reenviar', cls: 'border-destructive text-destructive', icon: AlertTriangle },
    };
    const s = map[status];
    const Icon = s.icon;
    return (
      <Badge variant="outline" className={`gap-1 text-[10px] ${s.cls}`}>
        <Icon className="h-3 w-3" /> {s.label}
      </Badge>
    );
  };

  const renderLine = (l: PickLine) => {
    const cl = toColiLine(l);
    const sets = completeSets(cl);
    const done = linePending(cl) === 0;
    const blocked = blockedFor(l);
    const meta = metaFor(l);
    const short = l.slots.some((s) => s.scanned > 0) && sets < l.quantity;
    const update = (patch: Partial<PickLine>) =>
      setLines((prev) => prev.map((x) => (x.key === l.key ? { ...x, ...patch } : x)));
    const changeSlot = (colis: number, value: number) =>
      setLines((prev) => {
        const upd = setColiScan(prev.map(toColiLine), l.key, colis, value);
        return prev.map((x, i) => ({ ...x, slots: upd[i].slots }));
      });

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
            {l.locations && (
              <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                <MapPin className="h-3 w-3" /> Sugerido: {l.locations}
              </p>
            )}
            {meta?.forklift && (
              <Badge variant="outline" className="mt-1 gap-1 border-amber-400 text-[10px] text-amber-700">
                <Forklift className="h-3 w-3" /> Empilhador
              </Badge>
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
          <div className="shrink-0 text-right">
            <p className="text-[10px] uppercase text-muted-foreground">Conjuntos</p>
            <Badge variant={sets >= l.quantity ? 'default' : 'secondary'} className="min-w-12 justify-center">
              {sets}/{l.quantity}
            </Badge>
          </div>
        </div>

        {/* Encomenda: nunca se escolhe a primeira automaticamente */}
        <div className="mt-2 flex items-center gap-2">
          <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
          {l.orderOptions.length > 1 ? (
            <Select value={l.orderNumber} onValueChange={(v) => update({ orderNumber: v })}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Escolher encomenda (obrigatório)" />
              </SelectTrigger>
              <SelectContent>
                {l.orderOptions.map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              className="h-8 flex-1 text-xs"
              placeholder="Nº da encomenda (obrigatório)"
              value={l.orderNumber}
              onChange={(e) => update({ orderNumber: e.target.value.trim() })}
            />
          )}
        </div>

        {!blocked && (
          <div className="mt-2 space-y-2 border-t pt-2">
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-[11px] text-muted-foreground">Tirado de</span>
              <Input
                list="picking-locations"
                className="h-8 flex-1 text-xs"
                placeholder="localização de origem"
                value={l.from}
                onChange={(e) => update({ from: e.target.value.toUpperCase() })}
              />
            </div>

            <div className="space-y-1">
              <p className="flex items-center gap-1 text-[10px] uppercase text-muted-foreground">
                <Boxes className="h-3 w-3" /> Caixas por volume
              </p>
              {l.slots.map((s) => (
                <div key={s.colis_number} className="flex items-center gap-2">
                  <Badge variant="outline" className="w-14 justify-center text-[10px]">
                    C{s.colis_number}/{l.slots.length}
                  </Badge>
                  <span className="flex-1 text-[11px] text-muted-foreground">
                    {s.done} gravado{s.scanned ? ` + ${s.scanned} por guardar` : ''} · faltam{' '}
                    {slotPending(s)}
                    {s.evidence && s.evidence !== 'scan' ? ' · sem prova de leitura' : ''}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => changeSlot(s.colis_number, s.scanned - 1)}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <Input
                    type="number"
                    min={0}
                    className="h-7 w-14 text-center text-xs"
                    value={s.scanned}
                    onFocus={() => setLastKey(l.key)}
                    onChange={(e) => changeSlot(s.colis_number, Number(e.target.value) || 0)}
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => applyScan(l.key, s.colis_number, 1)}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>

            {short && (
              <div className="space-y-1">
                <Select value={l.reason} onValueChange={(v) => update({ reason: v })}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Motivo da falta (obrigatório)" />
                  </SelectTrigger>
                  <SelectContent>
                    {SHORTAGE_REASONS.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {l.reason === 'outro' && (
                  <Input
                    className="h-8 text-xs"
                    placeholder="Notas (opcional)"
                    value={l.note}
                    onChange={(e) => update({ note: e.target.value })}
                    maxLength={200}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <ScanDock
        last={last}
        progress={{
          done: lines.filter((l) => linePending(toColiLine(l)) === 0).length,
          total: lines.length,
          label: 'Linhas completas',
        }}
      >
        <ScanInput onScan={handleScan} feedback={false} label="Ler etiqueta do volume (CÓDIGO-C1)" />
      </ScanDock>

      {choice && (
        <Card className="border-primary">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {choice.kind === 'linha' ? 'Qual a encomenda?' : 'Qual o volume?'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {choice.kind === 'linha'
              ? choice.candidates.map((c) => (
                  <Button
                    key={c.key}
                    variant="outline"
                    className="w-full justify-between"
                    onClick={() => {
                      const line = linesRef.current.find((l) => l.key === c.key);
                      setChoice(null);
                      if (!line) return;
                      if (choice.colis) applyScan(c.key, choice.colis);
                      else if (line.slots.length === 1) applyScan(c.key, 1);
                      else
                        setChoice({
                          kind: 'coli',
                          lineKey: c.key,
                          options: line.slots.filter((s) => slotPending(s) > 0).map((s) => s.colis_number),
                        });
                    }}
                  >
                    <span className="truncate">{c.label}</span>
                    <Badge variant="secondary">{c.orderNumber || 'sem encomenda'}</Badge>
                  </Button>
                ))
              : choice.options.map((n) => (
                  <Button
                    key={n}
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      applyScan(choice.lineKey, n);
                      setChoice(null);
                    }}
                  >
                    Volume C{n}
                  </Button>
                ))}
            <Button variant="ghost" className="w-full" onClick={() => setChoice(null)}>
              Cancelar leitura
            </Button>
          </CardContent>
        </Card>
      )}

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
                      if (totals.scanned > 0 && !active) {
                        toast.error('Há conferências por guardar nesta tarefa', {
                          description: 'Grave ou limpe o trabalho antes de trocar de tarefa.',
                        });
                        return;
                      }
                      if (active) {
                        setTask(null);
                        setLines([]);
                        setResult(null);
                        return;
                      }
                      setTask(t);
                      setResult(null);
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
            <ClipboardList className="h-4 w-4" /> Lista de picking {statusBadge()}
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
                  <span>Volumes conferidos</span>
                  <span>
                    {totals.done}/{totals.requested} · {totals.sets}/{totals.setsRequested} conjuntos
                  </span>
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

              {forkliftCount > 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-800 dark:bg-amber-950/20">
                  <Forklift className="h-4 w-4 shrink-0" />
                  {forkliftCount} artigo(s) em localizações que exigem empilhador — leve-o já consigo.
                </div>
              )}

              <div className="flex items-center gap-1 rounded-lg border bg-card p-1">
                <Button
                  variant={groupMode === 'rota' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-8 flex-1 text-xs"
                  onClick={() => setGroupMode('rota')}
                >
                  <Route className="mr-1 h-3.5 w-3.5" /> Por rota
                </Button>
                <Button
                  variant={groupMode === 'produto' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-8 flex-1 text-xs"
                  onClick={() => setGroupMode('produto')}
                >
                  <Package className="mr-1 h-3.5 w-3.5" /> Produto
                </Button>
                <Button
                  variant={groupMode === 'nota' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-8 flex-1 text-xs"
                  onClick={() => setGroupMode('nota')}
                >
                  <FileText className="mr-1 h-3.5 w-3.5" /> Entrega
                </Button>
              </div>

              <datalist id="picking-locations">
                {locationCodes.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>

              <div className="space-y-3">
                {groups.map((g) => (
                  <div key={g.title} className="space-y-2">
                    {groupMode !== 'produto' && (
                      <div className="flex items-center justify-between rounded-md bg-muted px-2 py-1">
                        <p className="truncate text-xs font-semibold">
                          {groupMode === 'nota' ? `Entrega ${g.title}` : g.title}
                        </p>
                        <Badge variant="secondary" className="text-[10px]">
                          {g.done}/{g.requested} volumes
                        </Badge>
                      </div>
                    )}
                    {g.lines.map((l) => renderLine(l))}
                  </div>
                ))}
              </div>

              {commitLines.length > 0 && (
                <div className="space-y-1 rounded-lg border bg-muted/40 p-2">
                  <p className="text-[11px] font-semibold uppercase text-muted-foreground">
                    Vai gravar (cais {dock || '—'})
                  </p>
                  {commitLines.map((l, i) => (
                    <p key={i} className="text-[11px]">
                      <strong>{l.order_number || 'sem encomenda'}</strong> · {l.product_code || l.product_name} ·{' '}
                      {l.colis.map((c) => `C${c.colis_number}×${c.quantity} de ${c.from_location || '?'}`).join(' · ')}
                    </p>
                  ))}
                </div>
              )}

              <Button
                className="w-full"
                disabled={stage.isPending || totals.scanned === 0 || !dock}
                onClick={() => void finalize()}
              >
                {stage.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                Gravar conferência e enviar para o cais
              </Button>

              {result && (
                <div className="space-y-1 rounded-lg border border-emerald-300 bg-emerald-50/60 p-2 dark:bg-emerald-950/20">
                  <p className="text-[11px] font-semibold">
                    Gravado: {result.volumes_moved} volume(s) em {result.dock}
                  </p>
                  {(result.lines ?? []).map((l) => (
                    <p key={l.note_item_id} className="text-[11px] text-muted-foreground">
                      {l.order_number} · {l.product_code} · conjuntos {l.complete_sets}/{l.requested_sets} ·{' '}
                      {(l.pending ?? []).filter((p) => p.pending > 0).length
                        ? `pendente ${(l.pending ?? [])
                            .filter((p) => p.pending > 0)
                            .map((p) => `C${p.colis_number}×${p.pending}`)
                            .join(' ')}`
                        : 'completo'}
                    </p>
                  ))}
                  {task && !isWarehouseOperator && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-1 w-full"
                      onClick={async () => {
                        await closeTask.mutateAsync({ taskId: task.id, status: 'completed' });
                        setTask(null);
                        setLines([]);
                        setResult(null);
                      }}
                    >
                      Concluir tarefa
                    </Button>
                  )}
                  {task && isWarehouseOperator && (
                    <p className="text-[11px] text-muted-foreground">
                      A tarefa fica em curso: o fecho é feito pelo responsável.
                    </p>
                  )}
                </div>
              )}

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
