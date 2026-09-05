import { useEffect, useState } from 'react';
import { Search, Route as RouteIcon, History, Layers, ClipboardList } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { MovementTimeline } from '@/components/traceability/MovementTimeline';
import { MovementHistoryView } from '@/components/stock/MovementHistoryView';
import { UnifiedMovementsReport } from '@/components/reports/UnifiedMovementsReport';
import { CountingMovementsReport } from '@/components/reports/CountingMovementsReport';

interface ProductHit {
  id: string;
  code: string;
  name: string;
}

/** Ecrã único de Movimentos: caminho do produto + históricos consolidados. */
export function MovementsView() {
  const [term, setTerm] = useState('');
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [selected, setSelected] = useState<ProductHit | null>(null);

  useEffect(() => {
    const q = term.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('products')
        .select('id, code, name')
        .or(`code.ilike.%${q}%,name.ilike.%${q}%`)
        .order('name')
        .limit(15);
      if (!cancelled) setHits((data ?? []) as ProductHit[]);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight">Movimentos</h1>
        <p className="text-sm text-muted-foreground">
          Todo o percurso do stock num só lugar: de onde saiu, por onde passou e para onde foi.
        </p>
      </div>

      <Tabs defaultValue="trace" className="space-y-4">
        <TabsList className="flex w-full flex-wrap justify-start">
          <TabsTrigger value="trace" className="gap-2">
            <RouteIcon className="h-4 w-4" />
            <span>Caminho do produto</span>
          </TabsTrigger>
          <TabsTrigger value="unified" className="gap-2">
            <Layers className="h-4 w-4" />
            <span className="hidden sm:inline">Unificado</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">Histórico</span>
          </TabsTrigger>
          <TabsTrigger value="counting" className="gap-2">
            <ClipboardList className="h-4 w-4" />
            <span className="hidden sm:inline">Contagens</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="trace">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Procurar produto</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Código ou nome do produto…"
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                />
              </div>

              {hits.length > 0 && !selected && (
                <div className="max-h-64 space-y-1 overflow-auto rounded-lg border p-1">
                  {hits.map((h) => (
                    <button
                      key={h.id}
                      onClick={() => {
                        setSelected(h);
                        setHits([]);
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                    >
                      <span className="font-mono text-xs text-muted-foreground">{h.code}</span>
                      <span className="truncate">{h.name}</span>
                    </button>
                  ))}
                </div>
              )}

              {selected && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-2">
                    <span className="font-mono text-xs text-muted-foreground">{selected.code}</span>
                    <span className="truncate text-sm font-medium">{selected.name}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto"
                      onClick={() => {
                        setSelected(null);
                        setTerm('');
                      }}
                    >
                      Trocar
                    </Button>
                  </div>
                  <MovementTimeline productId={selected.id} />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="unified">
          <UnifiedMovementsReport />
        </TabsContent>

        <TabsContent value="history">
          <MovementHistoryView />
        </TabsContent>

        <TabsContent value="counting">
          <CountingMovementsReport />
        </TabsContent>
      </Tabs>
    </div>
  );
}
