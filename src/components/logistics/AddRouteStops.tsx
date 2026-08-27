import { useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Plus, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { fetchOrdersByCode } from '@/lib/logistics/api';
import type { SepOrder } from '@/lib/logistics/types';
import {
  findActiveRouteConflicts,
  useAddRouteStops,
  type RouteConflict,
  type RouteStop,
} from '@/hooks/useRoutes';

type Candidate = {
  order: SepOrder;
  conflict: RouteConflict | null;
  alreadyHere: boolean;
};

export function AddRouteStops({ routeId, stops }: { routeId: string; stops: RouteStop[] }) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const add = useAddRouteStops();

  async function handleSearch() {
    const codes = query
      .split(/[\s,;]+/)
      .map((c) => c.trim())
      .filter(Boolean);
    if (codes.length === 0) {
      toast.error('Indique o número da encomenda');
      return;
    }
    setLoading(true);
    try {
      const { orders, notFound } = await fetchOrdersByCode(codes);
      if (notFound.length > 0) toast.error(`Encomenda não encontrada: ${notFound.join(', ')}`);
      if (orders.length === 0) {
        setCandidates([]);
        return;
      }
      const conflicts = await findActiveRouteConflicts(orders.map((o) => o.id));
      const byVenda = new Map(conflicts.map((c) => [c.venda_id, c]));
      const here = new Set(stops.map((s) => s.venda_id ?? ''));
      setCandidates(
        orders.map((order) => ({
          order,
          alreadyHere: here.has(order.id),
          conflict: byVenda.get(order.id) && byVenda.get(order.id)!.route_id !== routeId
            ? byVenda.get(order.id)!
            : null,
        })),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro na pesquisa');
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd() {
    const ok = candidates.filter((c) => !c.conflict && !c.alreadyHere);
    if (ok.length === 0) return;
    await add.mutateAsync({
      routeId,
      stops: ok.map(({ order }) => ({
        venda_id: order.id,
        venda_codigo: order.codigo,
        client_name: order.cliente || 'Cliente',
        address: order.morada || null,
        venda_data: order.entrega || null,
        venda_status: order.situacao || null,
      })),
    });
    setCandidates([]);
    setQuery('');
  }

  const addable = candidates.filter((c) => !c.conflict && !c.alreadyHere).length;

  return (
    <div className="rounded-lg border p-4">
      <p className="mb-2 text-sm font-medium">Adicionar nota de encomenda</p>
      <div className="flex flex-wrap gap-2">
        <Input
          className="max-w-xs"
          placeholder="Nº da encomenda (ex.: 12345)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleSearch();
          }}
        />
        <Button variant="outline" onClick={() => void handleSearch()} disabled={loading}>
          <Search className="mr-2 h-4 w-4" />
          {loading ? 'A procurar…' : 'Procurar'}
        </Button>
      </div>

      {candidates.length > 0 && (
        <div className="mt-3 space-y-2">
          {candidates.map(({ order, conflict, alreadyHere }) => (
            <div
              key={order.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm"
            >
              <div>
                <p className="font-medium">
                  {order.codigo} · {order.cliente}
                </p>
                <p className="text-muted-foreground">{order.morada || 'Sem morada'}</p>
              </div>
              {alreadyHere ? (
                <Badge variant="secondary">Já nesta rota</Badge>
              ) : conflict ? (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" /> Em {conflict.route_name}
                </Badge>
              ) : (
                <Badge variant="outline">{order.entrega || 'Sem data'}</Badge>
              )}
            </div>
          ))}
          <Button onClick={() => void handleAdd()} disabled={addable === 0 || add.isPending}>
            <Plus className="mr-2 h-4 w-4" />
            {add.isPending ? 'A adicionar…' : `Adicionar (${addable})`}
          </Button>
        </div>
      )}
    </div>
  );
}
