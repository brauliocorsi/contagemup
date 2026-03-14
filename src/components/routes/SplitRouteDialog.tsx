import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Scissors, MapPin } from 'lucide-react';
import { RouteStop } from '@/hooks/useRoutes';

interface SplitRouteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stops: RouteStop[];
  routeName: string;
  scheduledDate: string;
  onSplit: (groups: { name: string; stops: RouteStop[] }[]) => Promise<void>;
}

// Simple k-means-like clustering by postal code numeric value
function clusterByPostalCode(stops: RouteStop[], k: number): RouteStop[][] {
  if (stops.length === 0) return [];
  if (k >= stops.length) return stops.map(s => [s]);

  // Sort stops by postal code prefix (first 4 digits)
  const sorted = [...stops].sort((a, b) => {
    const pa = parseInt((a.postal_code || '0000').replace('-', '').slice(0, 4));
    const pb = parseInt((b.postal_code || '0000').replace('-', '').slice(0, 4));
    return pa - pb;
  });

  // Split into roughly equal groups maintaining postal code proximity
  const groups: RouteStop[][] = [];
  const baseSize = Math.floor(sorted.length / k);
  const remainder = sorted.length % k;
  let idx = 0;

  for (let i = 0; i < k; i++) {
    const size = baseSize + (i < remainder ? 1 : 0);
    if (size > 0) {
      groups.push(sorted.slice(idx, idx + size));
      idx += size;
    }
  }

  return groups;
}

// Sort stops within a group by postal code for optimal route
function optimizeGroupOrder(stops: RouteStop[]): RouteStop[] {
  return [...stops].sort((a, b) => {
    const pa = (a.postal_code || '0000').replace('-', '');
    const pb = (b.postal_code || '0000').replace('-', '');
    return pa.localeCompare(pb);
  });
}

const groupColors = [
  'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900 dark:text-blue-200',
  'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900 dark:text-emerald-200',
  'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900 dark:text-amber-200',
  'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900 dark:text-purple-200',
  'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-900 dark:text-rose-200',
  'bg-cyan-100 text-cyan-800 border-cyan-300 dark:bg-cyan-900 dark:text-cyan-200',
];

export function SplitRouteDialog({ open, onOpenChange, stops, routeName, scheduledDate, onSplit }: SplitRouteDialogProps) {
  const [numRoutes, setNumRoutes] = useState(3);
  const [splitting, setSplitting] = useState(false);

  const groups = useMemo(() => {
    const clustered = clusterByPostalCode(stops, numRoutes);
    return clustered.map((group, i) => ({
      name: `${routeName} - Parte ${i + 1}`,
      stops: optimizeGroupOrder(group),
    }));
  }, [stops, numRoutes, routeName]);

  const handleSplit = async () => {
    setSplitting(true);
    try {
      await onSplit(groups);
      onOpenChange(false);
    } finally {
      setSplitting(false);
    }
  };

  const postalRange = (group: RouteStop[]) => {
    const codes = group.map(s => s.postal_code || '').filter(Boolean).sort();
    if (codes.length === 0) return 'Sem CP';
    if (codes.length === 1) return codes[0]!.slice(0, 4);
    return `${codes[0]!.slice(0, 4)} - ${codes[codes.length - 1]!.slice(0, 4)}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scissors className="h-5 w-5" />
            Dividir e Otimizar Rota
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <Label>Número de sub-rotas</Label>
              <Input
                type="number"
                min={2}
                max={Math.min(stops.length, 10)}
                value={numRoutes}
                onChange={(e) => setNumRoutes(Math.max(2, Math.min(stops.length, parseInt(e.target.value) || 2)))}
              />
            </div>
            <div className="text-sm text-muted-foreground pb-2">
              {stops.length} paragens total
            </div>
          </div>

          <div className="space-y-3">
            {groups.map((group, i) => (
              <Card key={i} className="overflow-hidden">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge className={`${groupColors[i % groupColors.length]} border`}>
                        Rota {i + 1}
                      </Badge>
                      <span className="text-sm font-medium">{group.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      <span>{group.stops.length} paragens</span>
                      <Badge variant="outline" className="text-[10px]">
                        CP: {postalRange(group.stops)}
                      </Badge>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {group.stops.map((stop, j) => (
                      <div key={stop.id} className="flex items-center gap-2 text-sm py-0.5">
                        <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold shrink-0">
                          {j + 1}
                        </span>
                        <span className="truncate flex-1">{stop.client_name}</span>
                        <span className="text-xs text-muted-foreground">{stop.postal_code || '-'}</span>
                        {(stop as any).freguesia && (
                          <span className="text-[10px] text-muted-foreground hidden sm:inline">
                            {(stop as any).freguesia}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSplit} disabled={splitting || groups.length === 0}>
            {splitting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Scissors className="h-4 w-4 mr-1" />}
            Criar {groups.length} Rotas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
