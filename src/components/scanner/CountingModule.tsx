import { useEffect, useMemo, useState } from 'react';
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
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScanInput } from './ScanInput';
import { useLocationAudits, useMyLocationAudits, type LocationAuditItem } from '@/hooks/useLocationAudits';
import { parseScan, type QtyHandler } from '@/lib/scanner/commands';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Props {
  onCommand?: (raw: string) => boolean;
  registerQtyHandler?: (handler: QtyHandler | null) => void;
}

const norm = (s: string | null | undefined) => (s || '').trim().toLowerCase();

export function CountingModule({ onCommand, registerQtyHandler }: Props) {
  const { data: audits = [], isLoading } = useMyLocationAudits();
  const { useAuditWithItems, startAudit, updateAuditItem, completeAudit } = useLocationAudits();

  const [auditId, setAuditId] = useState<string | null>(null);
  const [location, setLocation] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [lastItemId, setLastItemId] = useState<string | null>(null);

  const { data: audit, isLoading: loadingAudit } = useAuditWithItems(auditId);

  const items = useMemo(() => audit?.items ?? [], [audit]);
  const blind = !!audit?.blind_mode;

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
    draft[item.id] ?? item.counted_quantity ?? 0;

  const setValue = (itemId: string, value: number) => {
    setDraft((prev) => ({ ...prev, [itemId]: Math.max(0, value) }));
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

  const handleScan = (raw: string) => {
    if (onCommand?.(raw)) return;
    const parsed = parseScan(raw);
    const code = norm(parsed.value);
    if (!code) return;

    // Leitura de localização
    const loc = locations.find((l) => norm(l) === code);
    if (loc) {
      setLocation(loc);
      toast.success(`Localização ${loc}`);
      return;
    }

    if (!location) {
      toast.error('Leia primeiro a localização a contar');
      return;
    }

    // Suporta códigos por coli: CODIGO-C2 (parseScan já separa base + coli)
    const coliMatch = code.match(/^(.*)-c(\d+)$/);
    const baseCode = coliMatch ? coliMatch[1] : code;
    const coli = parsed.colis ?? (coliMatch ? Number(coliMatch[2]) : null);

    const candidates = locationItems.filter(
      (i) =>
        norm(i.product_code) === baseCode ||
        norm(i.product_name) === baseCode ||
        norm(i.product_code) === code,
    );

    if (candidates.length === 0) {
      toast.error(`"${parsed.value}" não pertence a ${location}`);
      return;
    }

    const match = coli != null ? candidates.find((i) => i.colis_number === coli) : candidates[0];

    if (!match) {
      toast.error(`Coli ${coli} de ${baseCode.toUpperCase()} não está em ${location}`);
      return;
    }



    const next = valueOf(match) + 1;
    setValue(match.id, next);
    toast.success(`${match.product_name}${match.colis_number ? ` C${match.colis_number}` : ''}: ${next}`);
  };

  const confirmItem = async (item: LocationAuditItem) => {
    const counted = valueOf(item);
    if (audit?.status === 'pending') await startAudit.mutateAsync(audit.id);
    await updateAuditItem.mutateAsync({ itemId: item.id, countedQuantity: counted });
    setDraft((prev) => {
      const n = { ...prev };
      delete n[item.id];
      return n;
    });
    if (blind) {
      toast.success(`Registado: ${counted} un.`);
      return;
    }
    const diff = counted - item.expected_quantity;
    if (diff === 0) toast.success('Confirmado — sem divergência');
    else toast.warning(`Divergência de ${diff > 0 ? '+' : ''}${diff} un.`);
  };

  const confirmLocation = async () => {
    for (const item of locationItems) {
      await confirmItem(item);
    }
    toast.success(`Localização ${location} confirmada`);
    setLocation(null);
  };

  const finishAudit = async () => {
    if (!audit) return;
    const pending = items.filter((i) => i.status !== 'counted');
    if (pending.length > 0) {
      toast.error(`Faltam ${pending.length} artigo(s) por confirmar`);
      return;
    }
    await completeAudit.mutateAsync(audit.id);
    setAuditId(null);
    setLocation(null);
  };

  return (
    <div className="space-y-4">
      <ScanInput onScan={handleScan} label={location ? `A contar em ${location}` : 'Leia a localização'} />

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
                    setDraft({});
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

                <Button
                  className="w-full"
                  variant="outline"
                  onClick={finishAudit}
                  disabled={completeAudit.isPending || progress.done < progress.total}
                >
                  Concluir contagem
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
            <Button size="sm" onClick={confirmLocation} disabled={updateAuditItem.isPending}>
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
                const confirmed = item.status === 'counted' && draft[item.id] === undefined;
                return (
                  <div
                    key={item.id}
                    className={cn(
                      'rounded-lg border p-2',
                      confirmed && blind && 'border-primary/40 bg-primary/5',
                      confirmed && !blind && diff === 0 && 'border-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/20',
                      confirmed && !blind && diff !== 0 && 'border-amber-300 bg-amber-50/60 dark:bg-amber-950/20',
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
                              {(confirmed || draft[item.id] !== undefined) && (
                                <span className={cn('ml-2 font-medium', diff === 0 ? 'text-emerald-600' : 'text-amber-600')}>
                                  {diff === 0 ? 'sem divergência' : `${diff > 0 ? '+' : ''}${diff}`}
                                </span>
                              )}
                            </>
                          )}
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
                          onClick={() => confirmItem(item)}
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
    </div>
  );
}
