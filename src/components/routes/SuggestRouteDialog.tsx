import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, MapPin, Route, Truck, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface SaleClient {
  clientName: string;
  address: string;
  postalCode: string;
  city: string;
  vendaIds: string[];
  vendaCodigos: string[];
  lat?: number;
  lon?: number;
  selected: boolean;
}

interface SuggestRouteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateRoute: (data: {
    name: string;
    scheduled_date: string;
    stops: {
      client_name: string;
      address: string;
      postal_code: string;
      city: string;
      latitude: number | null;
      longitude: number | null;
      order_number: number;
      venda_id: string | null;
      venda_codigo: string | null;
    }[];
  }) => void;
}

// Nearest-neighbor algorithm for route optimization
function optimizeRoute(clients: SaleClient[]): SaleClient[] {
  if (clients.length <= 2) return clients;

  const withCoords = clients.filter(c => c.lat && c.lon);
  const withoutCoords = clients.filter(c => !c.lat || !c.lon);

  if (withCoords.length <= 1) return [...withCoords, ...withoutCoords];

  // Start from the first point, find nearest unvisited neighbor each time
  const ordered: SaleClient[] = [];
  const remaining = [...withCoords];

  // Start from the northernmost point (highest latitude) as a heuristic
  remaining.sort((a, b) => (b.lat || 0) - (a.lat || 0));
  ordered.push(remaining.shift()!);

  while (remaining.length > 0) {
    const last = ordered[ordered.length - 1];
    let nearestIdx = 0;
    let nearestDist = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const dist = haversineDistance(
        last.lat!, last.lon!,
        remaining[i].lat!, remaining[i].lon!
      );
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIdx = i;
      }
    }

    ordered.push(remaining.splice(nearestIdx, 1)[0]);
  }

  return [...ordered, ...withoutCoords];
}

// Haversine distance in km
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Group postal codes by prefix (first 4 digits for Portugal)
function getPostalPrefix(postalCode: string): string {
  return postalCode.replace(/[^0-9]/g, '').substring(0, 4);
}

export function SuggestRouteDialog({ open, onOpenChange, onCreateRoute }: SuggestRouteDialogProps) {
  const [loading, setLoading] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [clients, setClients] = useState<SaleClient[]>([]);
  const [routeName, setRouteName] = useState('');
  const [routeDate, setRouteDate] = useState(new Date().toISOString().split('T')[0]);
  const [fetched, setFetched] = useState(false);

  const fetchSalesAndExtractClients = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('gestaoclick-vendas');
      if (error) throw error;

      const productSalesMap = data?.productSalesMap || {};

      // Extract unique clients from all sales
      const clientMap = new Map<string, SaleClient>();

      for (const vendas of Object.values(productSalesMap) as any[][]) {
        for (const venda of vendas) {
          const clientKey = venda.cliente_nome?.toLowerCase().trim();
          if (!clientKey || clientKey === 'n/a') continue;

          const postalCode = (venda.cliente_cep || '').trim();
          if (!postalCode) continue; // Skip clients without postal code

          if (!clientMap.has(clientKey)) {
            clientMap.set(clientKey, {
              clientName: venda.cliente_nome,
              address: venda.cliente_endereco || '',
              postalCode: postalCode,
              city: venda.cliente_cidade || '',
              vendaIds: [venda.venda_id],
              vendaCodigos: [venda.codigo],
              selected: true,
            });
          } else {
            const existing = clientMap.get(clientKey)!;
            if (!existing.vendaIds.includes(venda.venda_id)) {
              existing.vendaIds.push(venda.venda_id);
              existing.vendaCodigos.push(venda.codigo);
            }
          }
        }
      }

      const uniqueClients = Array.from(clientMap.values());

      if (uniqueClients.length === 0) {
        toast.warning('Nenhuma venda com código postal encontrada');
        setLoading(false);
        return;
      }

      // Geocode all postal codes
      setGeocoding(true);
      const geocoded = await geocodeClients(uniqueClients);
      setGeocoding(false);

      // Optimize route order
      const optimized = optimizeRoute(geocoded);

      setClients(optimized);
      setFetched(true);
      setRouteName(`Rota ${new Date().toLocaleDateString('pt-PT')}`);

      toast.success(`${optimized.length} clientes encontrados e rota otimizada!`);
    } catch (err: any) {
      toast.error('Erro ao buscar vendas: ' + err.message);
    } finally {
      setLoading(false);
      setGeocoding(false);
    }
  };

  const geocodeClients = async (clientsList: SaleClient[]): Promise<SaleClient[]> => {
    const results: SaleClient[] = [];
    // Geocode in small batches to respect Nominatim rate limits
    for (let i = 0; i < clientsList.length; i++) {
      const client = { ...clientsList[i] };
      try {
        const query = client.city
          ? `${client.postalCode}, ${client.city}, Portugal`
          : `${client.postalCode}, Portugal`;
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`
        );
        const data = await response.json();
        if (data && data.length > 0) {
          client.lat = parseFloat(data[0].lat);
          client.lon = parseFloat(data[0].lon);
        }
      } catch { /* ignore geocoding errors */ }
      results.push(client);
      // Nominatim requires 1 req/sec for free usage
      if (i < clientsList.length - 1) {
        await new Promise(r => setTimeout(r, 1100));
      }
    }
    return results;
  };

  const selectedClients = clients.filter(c => c.selected);

  const totalDistance = (() => {
    const withCoords = selectedClients.filter(c => c.lat && c.lon);
    let dist = 0;
    for (let i = 1; i < withCoords.length; i++) {
      dist += haversineDistance(
        withCoords[i - 1].lat!, withCoords[i - 1].lon!,
        withCoords[i].lat!, withCoords[i].lon!
      );
    }
    return dist;
  })();

  const handleCreateRoute = () => {
    if (!routeName.trim() || selectedClients.length === 0) return;

    const optimized = optimizeRoute(selectedClients);

    onCreateRoute({
      name: routeName.trim(),
      scheduled_date: routeDate,
      stops: optimized.map((c, idx) => ({
        client_name: c.clientName,
        address: c.address,
        postal_code: c.postalCode,
        city: c.city,
        latitude: c.lat || null,
        longitude: c.lon || null,
        order_number: idx,
        venda_id: c.vendaIds[0] || null,
        venda_codigo: c.vendaCodigos[0] || null,
      })),
    });
  };

  const toggleClient = (idx: number) => {
    setClients(prev => prev.map((c, i) => i === idx ? { ...c, selected: !c.selected } : c));
  };

  // Group by postal code prefix for visual organization
  const postalGroups = new Map<string, number>();
  clients.forEach(c => {
    const prefix = getPostalPrefix(c.postalCode);
    postalGroups.set(prefix, (postalGroups.get(prefix) || 0) + 1);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Route className="h-5 w-5 text-primary" />
            Sugerir Rota a partir de Vendas
          </DialogTitle>
        </DialogHeader>

        {!fetched ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <Truck className="h-16 w-16 text-muted-foreground/50" />
            <div className="text-center space-y-2">
              <p className="text-muted-foreground">
                Vamos buscar as vendas ativas e agrupar os clientes por proximidade de código postal para sugerir a melhor rota.
              </p>
              {geocoding && (
                <p className="text-sm text-primary font-medium">
                  A geocodificar códigos postais... (pode demorar alguns segundos)
                </p>
              )}
            </div>
            <Button onClick={fetchSalesAndExtractClients} disabled={loading} size="lg">
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {geocoding ? 'A geocodificar...' : 'A buscar vendas...'}
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Buscar Vendas e Sugerir Rota
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col gap-4">
            {/* Route info */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nome da Rota</Label>
                <Input value={routeName} onChange={(e) => setRouteName(e.target.value)} />
              </div>
              <div>
                <Label>Data</Label>
                <Input type="date" value={routeDate} onChange={(e) => setRouteDate(e.target.value)} />
              </div>
            </div>

            {/* Summary */}
            <div className="flex gap-3 flex-wrap">
              <Badge variant="outline" className="text-sm py-1 px-3">
                <MapPin className="h-3 w-3 mr-1" />
                {selectedClients.length} paragens selecionadas
              </Badge>
              <Badge variant="outline" className="text-sm py-1 px-3">
                <Route className="h-3 w-3 mr-1" />
                ~{totalDistance.toFixed(0)} km estimados
              </Badge>
              <Badge variant="outline" className="text-sm py-1 px-3">
                📮 {postalGroups.size} zonas postais
              </Badge>
            </div>

            {/* Client list */}
            <div className="overflow-y-auto flex-1 space-y-1 max-h-[350px] border rounded-lg p-2">
              {clients.map((client, idx) => (
                <div
                  key={idx}
                  className={`flex items-center gap-3 p-2.5 rounded-lg border transition-colors ${
                    client.selected ? 'bg-accent/30 border-primary/20' : 'opacity-50'
                  }`}
                >
                  <Checkbox
                    checked={client.selected}
                    onCheckedChange={() => toggleClient(idx)}
                  />
                  <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">
                    {client.selected ? selectedClients.indexOf(client) + 1 : '-'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{client.clientName}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>📮 {client.postalCode}</span>
                      {client.city && <span>• {client.city}</span>}
                      {client.lat && <span className="text-green-600">✓ GPS</span>}
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-xs shrink-0">
                    {client.vendaCodigos.length} venda{client.vendaCodigos.length > 1 ? 's' : ''}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {fetched && (
          <DialogFooter>
            <Button variant="outline" onClick={() => { setFetched(false); setClients([]); }}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Refazer
            </Button>
            <Button
              onClick={handleCreateRoute}
              disabled={selectedClients.length === 0 || !routeName.trim()}
            >
              <Route className="h-4 w-4 mr-1" />
              Criar Rota ({selectedClients.length} paragens)
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
