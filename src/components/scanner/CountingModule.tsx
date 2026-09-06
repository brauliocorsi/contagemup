import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ClipboardCheck,
  Loader2,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  Minus,
  Plus,
  Check,
  EyeOff,
  HelpCircle,
  RotateCcw,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
import { ScanInput } from './ScanInput';
import { useLocationAudits, useMyLocationAudits, type LocationAuditItem } from '@/hooks/useLocationAudits';
import { useAuth } from '@/hooks/useAuth';
import { parseScan, type QtyHandler } from '@/lib/scanner/commands';
import { scanFeedback } from '@/lib/scanner/feedback';
import { resolveCountingScan } from '@/lib/scanner/countingMatch';
import {
  clearDraft,
  draftSummary,
  emptyDraft,
  loadDraft,
  markEntry,
  saveDraft,
  setEntry,
  type CountingDraft,
} from '@/lib/scanner/countingDraft';
import { ScanDock, type LastScan } from './ScanDock';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Props {
  onCommand?: (raw: string) => boolean;
  registerQtyHandler?: (handler: QtyHandler | null) => void;
}

const norm = (s: string | null | undefined) => (s || '').trim().toLowerCase();

export function CountingModule({ onCommand, registerQtyHandler }: Props) {
  const { user } = useAuth();
  const { data: audits = [], isLoading } = useMyLocationAudits();
  const { useAuditWithItems, startAudit, updateAuditItem, deliverAudit } = useLocationAudits();

  const [auditId, setAuditId] = useState<string | null>(null);
  const [location, setLocation] = useState<string | null>(null);
  const [draft, setDraft] = useState<CountingDraft | null>(null);
  const [lastItemId, setLastItemId] = useState<string | null>(null);
  const [last, setLast] = useState<LastScan | null>(null);
  /** Leitura que serve vários colis e precisa de escolha explícita. */
  const [pendingChoice, setPendingChoice] = useState<{ label: string; items: LocationAuditItem[] } | null>(null);
  const [confirmAllOpen, setConfirmAllOpen] = useState(false);

  const userId = user?.id ?? 'anonimo';

  const fail = (title: string, detail?: string) => {
    scanFeedback('error');
    setLast({ kind: 'erro', title, detail });
    toast.error(detail ? `${title} — ${detail}` : title);
  };

  const { data: audit, isLoading: loadingAudit } = useAuditWithItems(auditId);

  const items = useMemo(() => audit?.items ?? [], [audit]);
  const blind = !!audit?.blind_mode;

  // Recupera o rascunho guardado para este operador nesta conferência.
  useEffect(() => {
    if (!auditId) {
      setDraft(null);
      return;
    }
    const restored = loadDraft(userId, auditId);
    setDraft(restored);
    const porGuardar = draftSummary(restored).porGuardar;
    if (porGuardar > 0) {
      toast.info(`Recuperadas ${porGuardar} linha(s) por guardar da última sessão`);
    }
  }, [auditId, userId]);

  const updateDraft = useCallback((fn: (d: CountingDraft) => CountingDraft) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      saveDraft(next);
      return next;
    });
  }, []);

  const locations = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => set.add(i.location));
    (audit?.locations ?? []).forEach((l) => set.add(l));
    return Array.from(set).sort();
  }, [items, audit]);

  const locationItems = useMemo(
    () => items.filter((i) => norm(i.location) === norm(location)),
    [items, location],
  );

  const progress = useMemo(() => {
    const done = items.filter((i) => i.status === 'counted').length;
    return { done, total: items.length, pct: items.length ? Math.round((done / items.length) * 100) : 0 };
  }, [items]);

  /** Valor atual (rascunho ou já gravado). */
  const valueOf = (item: LocationAuditItem) =>
    draft?.entries[item.id]?.value ?? item.counted_quantity ?? 0;

  const isPending = (item: LocationAuditItem) =>
    (draft?.entries[item.id]?.status ?? 'guardado') !== 'guardado';

  const setValue = (itemId: string, value: number) => {
    if (!auditId) return;
    updateDraft((d) => setEntry(d, itemId, value, auditId));
    setLastItemId(itemId);
  };

  useEffect(() => {
    if (!registerQtyHandler) return;
    const handler: QtyHandler = ({ delta, set }) => {
      if (!lastItemId) {
        toast.error('Leia primeiro um produto da localização');
        return;
      }
      const item = locationItems.find((i) => i.id === lastItemId);
      if (!item) return;
      if (typeof set === 'number') setValue(lastItemId, set);
      else if (delta) setValue(lastItemId, valueOf(item) + delta);
    };
    registerQtyHandler(handler);
    return () => registerQtyHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerQtyHandler, lastItemId, locationItems, draft]);

  /** Soma uma unidade à linha escolhida e mostra o retorno da leitura. */
  const countOne = (item: LocationAuditItem) => {
    const next = valueOf(item) + 1;
    setValue(item.id, next);
    setPendingChoice(null);
    scanFeedback('ok');
    setLast({
      kind: 'produto',
      title: item.product_name,
      detail: `${item.product_code}${item.colis_number ? ` • coli ${item.colis_number}` : ''} • ${item.location}`,
      quantity: `${next}`,
      remaining: blind ? undefined : `esperado ${item.expected_quantity}`,
    });
  };

  const handleScan = (raw: string) => {
    if (onCommand?.(raw)) return;
    const parsed = parseScan(raw);
    const code = norm(parsed.value);
    if (!code) return;

    // Leitura de localização
    const bare = code.replace(/^loc-/, '');
    const loc = locations.find((l) => norm(l) === code || norm(l) === bare);
    if (loc) {
      setLocation(loc);
      setPendingChoice(null);
      scanFeedback('ok');
      setLast({ kind: 'localizacao', title: loc, detail: 'Localização a contar' });
      return;
    }

    if (!location) {
      fail('Leia primeiro a localização a contar');
      return;
    }

    const result = resolveCountingScan(locationItems, parsed.value, parsed.colis ?? null, location);

    if (result.status === 'ok' && result.item) {
      countOne(result.item);
      return;
    }

    if (result.status === 'ambiguo') {
      // Nunca escolhemos por adivinhação: o operador identifica o coli.
      setPendingChoice({ label: result.baseCode.toUpperCase(), items: result.candidates });
      fail('Identifique o coli', result.message);
      return;
    }

    if (result.status === 'coli_inexistente') {
      fail(result.message, 'Nada foi somado a outro coli');
      return;
    }

    // Artigo não previsto nesta localização: fica registado como exceção.
    if (auditId) {
      updateDraft((d) => ({
        ...d,
        exceptions: [
          ...d.exceptions,
          { code: result.baseCode, colis: result.colis, location, quantity: 1 },
        ],
      }));
    }
    fail(result.message, 'Registado como exceção para o responsável');
  };

  const confirmItem = async (item: LocationAuditItem) => {
    const counted = valueOf(item);
    if (audit?.status === 'pending') await startAudit.mutateAsync(audit.id);
    try {
      await updateAuditItem.mutateAsync({ itemId: item.id, countedQuantity: counted });
      updateDraft((d) => markEntry(d, item.id, 'guardado'));
    } catch (e) {
      updateDraft((d) => markEntry(d, item.id, 'erro', (e as Error).message));
      throw e;
    }
    if (blind) {
      toast.success(`Registado: ${counted} un.`);
      return;
    }
    const diff = counted - item.expected_quantity;
    if (diff === 0) toast.success('Confirmado — sem divergência');
    else toast.warning(`Divergência de ${diff > 0 ? '+' : ''}${diff} un.`);
  };

  const confirmLocation = async () => {
    setConfirmAllOpen(false);
    let falhas = 0;
    for (const item of locationItems) {
      try {
        await confirmItem(item);
      } catch {
        falhas++;
      }
    }
    if (falhas > 0) {
      toast.error(`${falhas} linha(s) não foram guardadas. Ficam marcadas para reenviar.`);
      return;
    }
    toast.success(`Localização ${location} confirmada`);
    setLocation(null);
  };

  /** Reenvia apenas o que ficou por guardar (rede em falta, por exemplo). */
  const retryPending = async () => {
    const pendentes = items.filter((i) => isPending(i));
    if (pendentes.length === 0) {
      toast.info('Não há linhas por guardar');
      return;
    }
    let ok = 0;
    for (const item of pendentes) {
      try {
        await confirmItem(item);
        ok++;
      } catch {
        /* mantém-se marcada como erro */
      }
    }
    toast.success(`${ok} de ${pendentes.length} linha(s) guardadas`);
  };

  const finishAudit = async () => {
    if (!audit) return;
    const pending = items.filter((i) => i.status !== 'counted');
    if (pending.length > 0) {
      toast.error(`Faltam ${pending.length} artigo(s) por confirmar`);
      return;
    }
    await deliverAudit.mutateAsync(audit.id);
    toast.success('Contagem entregue. O responsável vai fechar a conferência.');
    clearDraft(userId, audit.id);
    setAuditId(null);
    setLocation(null);
  };

  const resumo = draft ? draftSummary(draft) : { porGuardar: 0, guardadas: 0, comErro: 0 };
  const divergentesNaLocalizacao = locationItems.filter(
    (i) => valueOf(i) !== i.expected_quantity,
  ).length;

  return (
    <div className="space-y-4">
      <ScanDock last={last} progress={{ done: progress.done, total: progress.total, label: 'Artigos confirmados' }}>
        <ScanInput
          onScan={handleScan}
          feedback={false}
          label={location ? `A contar em ${location}` : 'Leia a localização (LOC-…)'}
        />
      </ScanDock>

      {pendingChoice && (
        <Card className="border-amber-300 bg-amber-50/60 dark:bg-amber-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <HelpCircle className="h-4 w-4" /> Qual o coli de {pendingChoice.label}?
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-[11px] text-muted-foreground">
              A etiqueta lida serve mais do que um coli. Escolha o que tem em mãos — nada foi somado.
            </p>
            <div className="flex flex-wrap gap-2">
              {pendingChoice.items.map((i) => (
                <Button key={i.id} size="sm" variant="outline" onClick={() => countOne(i)}>
                  Coli {i.colis_number ?? '—'} • {valueOf(i)} un.
                </Button>
              ))}
              <Button size="sm" variant="ghost" onClick={() => setPendingChoice(null)}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ClipboardCheck className="h-4 w-4" /> Contagens atribuídas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : audits.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sem contagens atribuídas.</p>
          ) : (
            audits.map((a) => {
              const active = auditId === a.id;
              return (
                <button
                  key={a.id}
                  onClick={() => {
                    setAuditId(active ? null : a.id);
                    setLocation(null);
                    setPendingChoice(null);
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg border p-2 text-left text-xs transition-colors',
                    active ? 'border-primary bg-primary/5' : 'hover:border-primary/40',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{a.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {a.locations.length} localização(ões) • {new Date(a.created_at).toLocaleDateString('pt-PT')}
                    </p>
                  </div>
                  <Badge variant={a.status === 'in_progress' ? 'default' : 'secondary'}>
                    {a.status === 'in_progress' ? 'Em curso' : 'Pendente'}
                  </Badge>
                </button>
              );
            })
          )}
        </CardContent>
      </Card>

      {auditId && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4" /> Localizações a confirmar
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loadingAudit ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Confirmado</span>
                    <span>
                      {progress.done}/{progress.total} artigos
                    </span>
                  </div>
                  <Progress value={progress.pct} />
                </div>

                {(resumo.porGuardar > 0 || resumo.comErro > 0) && (
                  <div className="flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50/60 p-2 text-[11px] dark:bg-amber-950/20">
                    <span>
                      {resumo.porGuardar} por guardar
                      {resumo.comErro > 0 ? ` • ${resumo.comErro} com erro` : ''}
                    </span>
                    <Button size="sm" variant="outline" onClick={retryPending}>
                      <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reenviar
                    </Button>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {locations.map((l) => {
                    const its = items.filter((i) => norm(i.location) === norm(l));
                    const done = its.length > 0 && its.every((i) => i.status === 'counted');
                    return (
                      <Button
                        key={l}
                        size="sm"
                        variant={location === l ? 'default' : done ? 'outline' : 'secondary'}
                        onClick={() => setLocation(location === l ? null : l)}
                      >
                        {done && <CheckCircle2 className="mr-1 h-3.5 w-3.5" />}
                        {l}
                        <span className="ml-1 text-[10px] opacity-70">({its.length})</span>
                      </Button>
                    );
                  })}
                </div>

                {draft && draft.exceptions.length > 0 && (
                  <div className="rounded-lg border border-dashed p-2 text-[11px] text-muted-foreground">
                    <p className="font-medium text-foreground">
                      {draft.exceptions.length} leitura(s) de artigos não previstos
                    </p>
                    {draft.exceptions.slice(-4).map((e, idx) => (
                      <p key={idx} className="truncate font-mono">
                        {e.code}
                        {e.colis ? `-C${e.colis}` : ''} • {e.location}
                      </p>
                    ))}
                    <p>Avise o responsável — não entram na contagem.</p>
                  </div>
                )}

                <Button
                  className="w-full"
                  variant="outline"
                  onClick={finishAudit}
                  disabled={progress.done < progress.total || deliverAudit.isPending}
                >
                  Entregar contagem
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {auditId && location && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              Artigos em {location}
              {blind && (
                <Badge variant="outline" className="gap-1">
                  <EyeOff className="h-3 w-3" /> Cega
                </Badge>
              )}
            </CardTitle>
            <Button
              size="sm"
              onClick={() => setConfirmAllOpen(true)}
              disabled={updateAuditItem.isPending || locationItems.length === 0}
            >
              <Check className="mr-1 h-3.5 w-3.5" /> Confirmar tudo
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {locationItems.length === 0 ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
                Sem stock registado nesta localização.
              </p>
            ) : (
              locationItems.map((item) => {
                const counted = valueOf(item);
                const diff = counted - item.expected_quantity;
                const pendente = isPending(item);
                const confirmed = item.status === 'counted' && !pendente;
                const erro = draft?.entries[item.id]?.status === 'erro';
                return (
                  <div
                    key={item.id}
                    className={cn(
                      'rounded-lg border p-2',
                      confirmed && blind && 'border-primary/40 bg-primary/5',
                      confirmed && !blind && diff === 0 && 'border-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/20',
                      confirmed && !blind && diff !== 0 && 'border-amber-300 bg-amber-50/60 dark:bg-amber-950/20',
                      erro && 'border-destructive/60',
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{item.product_name}</p>
                        <p className="truncate font-mono text-[11px] text-muted-foreground">
                          {item.product_code}
                          {item.colis_number ? `-C${item.colis_number}` : ''}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {blind ? (
                            confirmed ? 'Contagem registada' : 'Contagem cega'
                          ) : (
                            <>
                              Sistema: {item.expected_quantity} un.
                              {(confirmed || pendente) && (
                                <span className={cn('ml-2 font-medium', diff === 0 ? 'text-emerald-600' : 'text-amber-600')}>
                                  {diff === 0 ? 'sem divergência' : `${diff > 0 ? '+' : ''}${diff}`}
                                </span>
                              )}
                            </>
                          )}
                          {pendente && <span className="ml-2 text-amber-600">por guardar</span>}
                          {erro && <span className="ml-2 text-destructive">falhou — reenviar</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setValue(item.id, counted - 1)}
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </Button>
                        <Input
                          type="number"
                          min={0}
                          className="h-8 w-16 text-center"
                          value={counted}
                          onFocus={() => setLastItemId(item.id)}
                          onChange={(e) => setValue(item.id, Number(e.target.value) || 0)}
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setValue(item.id, counted + 1)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => confirmItem(item).catch(() => undefined)}
                          disabled={updateAuditItem.isPending}
                          aria-label="Confirmar artigo"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <AlertTriangle className="h-3 w-3" /> {blind ? 'Modo cego: as quantidades em sistema só são comparadas no relatório. ' : ''}As divergências ficam registadas no relatório de
              conferências, sem alterar o stock.
            </p>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={confirmAllOpen} onOpenChange={setConfirmAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar tudo em {location}?</AlertDialogTitle>
            <AlertDialogDescription>
              Vai gravar {locationItems.length} linha(s)
              {blind
                ? '.'
                : divergentesNaLocalizacao > 0
                  ? `, das quais ${divergentesNaLocalizacao} com diferença face ao sistema.`
                  : ', todas iguais ao sistema.'}{' '}
              As linhas que não contou ficam com o valor que está no ecrã.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmLocation}>Confirmar tudo</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
