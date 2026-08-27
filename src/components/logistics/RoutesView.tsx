import { useState } from 'react';
import { MapPin, Route as RouteIcon, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ROUTE_STATUS_LABELS,
  plateFromNotes,
  useDeleteRoute,
  useRoutes,
  useUpdateRoute,
  type RouteStatus,
} from '@/hooks/useRoutes';
import { RouteDetailView } from './RouteDetailView';

export function RoutesView({ initialRouteId }: { initialRouteId?: string | null }) {
  const [openId, setOpenId] = useState<string | null>(initialRouteId ?? null);
  const { data: routes = [], isLoading } = useRoutes();
  const updateRoute = useUpdateRoute();
  const deleteRoute = useDeleteRoute();

  if (openId) return <RouteDetailView routeId={openId} onBack={() => setOpenId(null)} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-xl font-bold tracking-tight">Rotas</h1>
        <p className="text-sm text-muted-foreground">
          Rotas criadas a partir das Notas de Separação · documentos, picking e guias por rota
        </p>
      </div>

      <section className="rounded-lg border border-border bg-card">
        {isLoading ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">A carregar rotas…</p>
        ) : routes.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            Ainda não existem rotas. Selecione notas em "Notas de Separação" e clique em "Criar rota".
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-5 py-2">Rota</th>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Notas</th>
                  <th className="px-3 py-2">Matrícula</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {routes.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-5 py-2 font-semibold">{r.name}</td>
                    <td className="px-3 py-2">{r.scheduled_date}</td>
                    <td className="px-3 py-2">
                      <Badge variant="secondary">{r.stops}</Badge>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{plateFromNotes(r.notes) || '—'}</td>
                    <td className="px-3 py-2">
                      <Select
                        value={r.status}
                        onValueChange={(v) => updateRoute.mutate({ id: r.id, status: v as RouteStatus })}
                      >
                        <SelectTrigger className="h-8 w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(ROUTE_STATUS_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-2">
                        <Button size="sm" onClick={() => setOpenId(r.id)}>
                          <MapPin className="mr-2 h-4 w-4" /> Abrir
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteRoute.mutate(r.id)}
                          disabled={deleteRoute.isPending}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <RouteIcon className="h-3.5 w-3.5" /> Uma nota só pode estar numa rota ativa de cada vez.
      </p>
    </div>
  );
}
