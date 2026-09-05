import { useMemo, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ProductDamageWithProduct } from '@/types/damages';
import { mapDatabaseError } from '@/lib/errorMessages';
import { LocationSelect } from '@/components/counting/LocationSelect';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ArrowLeft, MapPin, PackageSearch, CheckCircle2, XCircle, Undo2, CalendarClock } from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';

type ActionType = 'found' | 'not_found' | 'already_resolved';

interface DoneEntry {
  damageId: string;
  action: ActionType;
  quantity: number;
  productName: string;
  movementId?: string | null;
  prevLocation?: string | null;
  prevSourceLocation?: string | null;
  foundLocation?: string | null;
}

const ageInDays = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

const FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'no_location', label: 'Sem localização' },
  { value: 'with_location', label: 'Com localização' },
  { value: 'old', label: 'Mais de 30 dias' },
] as const;

type FilterValue = typeof FILTERS[number]['value'];

interface Props {
  onBack?: () => void;
}

export function DamageRegularizationView({ onBack }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<FilterValue>('all');
  const [done, setDone] = useState<DoneEntry[]>([]);
  const [foundTarget, setFoundTarget] = useState<ProductDamageWithProduct | null>(null);
  const [foundLocation, setFoundLocation] = useState('');
  const [confirm, setConfirm] = useState<{ damage: ProductDamageWithProduct; action: ActionType } | null>(null);

  // Snapshot of the pending list when the screen opened (progress baseline)
  const { data: pending = [], isLoading } = useQuery({
    queryKey: ['damages-regularization'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_damages')
        .select('*, product:products(id, code, name, category, total_colis)')
        .eq('status', 'active')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data as unknown as ProductDamageWithProduct[]) || [];
    },
    staleTime: 30_000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['damages-regularization'] });
    queryClient.invalidateQueries({ queryKey: ['damages'] });
    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({ queryKey: ['counts'] });
  };

  const regularize = useMutation({
    mutationFn: async (vars: { damage: ProductDamageWithProduct; action: ActionType; location?: string }) => {
      const { data, error } = await supabase.rpc('regularize_damage', {
        p_damage_id: vars.damage.id,
        p_action: vars.action,
        p_found_location: vars.location ?? null,
      });
      if (error) throw error;
      return data as Record<string, unknown>;
    },
    onSuccess: (data, vars) => {
      setDone(prev => [
        ...prev,
        {
          damageId: vars.damage.id,
          action: vars.action,
          quantity: vars.damage.quantity,
          productName: vars.damage.product?.name || vars.damage.product_id,
          movementId: (data?.movement_id as string) ?? null,
          prevLocation: (data?.prev_location as string) ?? null,
          prevSourceLocation: (data?.prev_source_location as string) ?? null,
          foundLocation: vars.location ?? null,
        },
      ]);
      toast({ title: 'Registo tratado', description: 'Podes desfazer enquanto este ecrã estiver aberto.' });
      invalidate();
    },
    onError: (error: Error) => {
      toast({ title: 'Erro', description: mapDatabaseError(error, 'Não foi possível regularizar'), variant: 'destructive' });
    },
  });

  const undo = useMutation({
    mutationFn: async (entry: DoneEntry) => {
      const { error } = await supabase.rpc('undo_regularize_damage', {
        p_damage_id: entry.damageId,
        p_action: entry.action,
        p_movement_id: entry.movementId ?? null,
        p_prev_location: entry.prevLocation ?? null,
        p_prev_source_location: entry.prevSourceLocation ?? null,
      });
      if (error) throw error;
      return true;
    },
    onSuccess: (_d, entry) => {
      setDone(prev => prev.filter(e => e.damageId !== entry.damageId));
      toast({ title: 'Ação desfeita' });
      invalidate();
    },
    onError: (error: Error) => {
      toast({ title: 'Erro', description: mapDatabaseError(error, 'Não foi possível desfazer'), variant: 'destructive' });
    },
  });

  const treatedIds = useMemo(() => new Set(done.map(d => d.damageId)), [done]);

  const visible = useMemo(() => {
    return pending.filter(d => {
      if (treatedIds.has(d.id)) return false;
      const loc = d.location || d.source_location;
      if (filter === 'no_location') return !loc;
      if (filter === 'with_location') return !!loc;
      if (filter === 'old') return ageInDays(d.created_at) > 30;
      return true;
    });
  }, [pending, filter, treatedIds]);

  const foundEntries = done.filter(d => d.action === 'found');
  const closedEntries = done.filter(d => d.action !== 'found');
  const treatedCount = done.length;
  const progress = Math.round((treatedCount / Math.max(treatedCount + pending.length, 1)) * 100);

  const openFound = (damage: ProductDamageWithProduct) => {
    setFoundLocation('');
    setFoundTarget(damage);
  };

  const submitFound = () => {
    if (!foundTarget || !foundLocation) return;
    regularize.mutate({ damage: foundTarget, action: 'found', location: foundLocation });
    setFoundTarget(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {onBack && (
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
        )}
        <h2 className="text-lg font-semibold">Regularização de Avarias</h2>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Progresso</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Progress value={progress} />
          <p className="text-sm text-muted-foreground">
            {treatedCount} tratados · {pending.length} por tratar
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map(f => (
          <Button
            key={f.value}
            size="sm"
            variant={filter === f.value ? 'default' : 'outline'}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm p-4">A carregar…</p>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            Nada por tratar com este filtro.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map(d => {
            const days = ageInDays(d.created_at);
            const loc = d.location || d.source_location;
            return (
              <Card key={d.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium leading-tight">{d.product?.name || 'Produto'}</p>
                        <p className="text-xs text-muted-foreground font-mono">{d.product?.code}</p>
                      </div>
                      <Badge variant={days > 30 ? 'destructive' : 'secondary'} className="shrink-0">
                        <CalendarClock className="h-3 w-3 mr-1" />
                        {days} dias
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Badge variant="outline">Qtd: {d.quantity}</Badge>
                      {d.colis_number != null && <Badge variant="outline">Coli {d.colis_number}</Badge>}
                      <Badge variant="outline">{d.damage_type}</Badge>
                      <Badge variant={loc ? 'outline' : 'destructive'}>
                        <MapPin className="h-3 w-3 mr-1" />
                        {loc || 'sem localização'}
                      </Badge>
                    </div>
                    {d.description && <p className="text-sm text-muted-foreground pt-1">{d.description}</p>}
                    <p className="text-xs text-muted-foreground">
                      Registado em {format(new Date(d.created_at), 'dd/MM/yyyy', { locale: pt })}
                    </p>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-3">
                    <Button size="sm" onClick={() => openFound(d)} disabled={regularize.isPending}>
                      <PackageSearch className="h-4 w-4 mr-1" /> Encontrado
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirm({ damage: d, action: 'not_found' })}
                      disabled={regularize.isPending}
                    >
                      <XCircle className="h-4 w-4 mr-1" /> Não encontrado
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirm({ damage: d, action: 'already_resolved' })}
                      disabled={regularize.isPending}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1" /> Já resolvido
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {done.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Resumo desta sessão</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm space-y-1">
              <p>
                Encontrados e postos em quarentena: <strong>{foundEntries.length}</strong> registos ·{' '}
                <strong>{foundEntries.reduce((s, e) => s + e.quantity, 0)}</strong> unidades
              </p>
              <p>Fechados sem stock: <strong>{closedEntries.length}</strong></p>
              <p>Por tratar: <strong>{pending.length}</strong></p>
            </div>
            <div className="space-y-2">
              {done.map(e => (
                <div key={e.damageId} className="flex items-center justify-between gap-2 rounded-md border p-2">
                  <div className="text-sm min-w-0">
                    <p className="truncate">{e.productName}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.action === 'found'
                        ? `Encontrado em ${e.foundLocation} → QUARENTENA`
                        : e.action === 'not_found'
                          ? 'Fechado — não encontrado'
                          : 'Fechado — já resolvido fora do sistema'}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => undo.mutate(e)} disabled={undo.isPending}>
                    <Undo2 className="h-4 w-4 mr-1" /> Desfazer
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Found dialog */}
      <Dialog open={!!foundTarget} onOpenChange={open => !open && setFoundTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Peça encontrada</DialogTitle>
            <DialogDescription>
              Indica onde a peça está fisicamente agora. A quantidade ({foundTarget?.quantity}) entra em QUARENTENA.
            </DialogDescription>
          </DialogHeader>
          <LocationSelect
            value={foundLocation}
            onValueChange={setFoundLocation}
            placeholder="Selecionar localização física..."
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setFoundTarget(null)}>Cancelar</Button>
            <Button onClick={submitFound} disabled={!foundLocation || regularize.isPending}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm close */}
      <AlertDialog open={!!confirm} onOpenChange={open => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.action === 'not_found' ? 'Marcar como não encontrado?' : 'Marcar como já resolvido?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              O registo é fechado como regularização histórica. Não é criado nem alterado stock.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirm) regularize.mutate({ damage: confirm.damage, action: confirm.action });
                setConfirm(null);
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
