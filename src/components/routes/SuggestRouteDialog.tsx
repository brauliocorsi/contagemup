import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, MapPin, Route, Truck, RefreshCw, Filter } from 'lucide-react';
import { toast } from 'sonner';

interface SaleClient {
  clientName: string;
  address: string;
  postalCode: string;
  city: string;
  freguesia?: string;
  municipio?: string;
  vendaIds: string[];
  vendaCodigos: string[];
  vendaSituacoes: string[];
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

function optimizeRoute(clients: SaleClient[]): SaleClient[] {
  if (clients.length <= 2) return clients;
  const withCoords = clients.filter(c => c.lat && c.lon);
  const withoutCoords = clients.filter(c => !c.lat || !c.lon);
  if (withCoords.length <= 1) return [...withCoords, ...withoutCoords];

  const ordered: SaleClient[] = [];
  const remaining = [...withCoords];
  remaining.sort((a, b) => (b.lat || 0) - (a.lat || 0));
  ordered.push(remaining.shift()!);

  while (remaining.length > 0) {
    const last = ordered[ordered.length - 1];
    let nearestIdx = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const dist = haversineDistance(last.lat!, last.lon!, remaining[i].lat!, remaining[i].lon!);
      if (dist < nearestDist) { nearestDist = dist; nearestIdx = i; }
    }
    ordered.push(remaining.splice(nearestIdx, 1)[0]);
  }
  return [...ordered, ...withoutCoords];
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getPostalPrefix(postalCode: string): string {
  return postalCode.replace(/[^0-9]/g, '').substring(0, 4);
}

// Extract Portuguese postal code (XXXX-XXX) from an address string
function extractPostalCode(text: string): string {
  if (!text) return '';
  const match = text.match(/\d{4}-\d{3}/);
  return match ? match[0] : '';
}

type Step = 'select_status' | 'loading' | 'results';

export function SuggestRouteDialog({ open, onOpenChange, onCreateRoute }: SuggestRouteDialogProps) {
  const [step, setStep] = useState<Step>('select_status');
  const [loading, setLoading] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [clients, setClients] = useState<SaleClient[]>([]);
  const [routeName, setRouteName] = useState('');
  const [routeDate, setRouteDate] = useState(new Date().toISOString().split('T')[0]);

  // Status selection
  const [availableStatuses, setAvailableStatuses] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());
  const [statusesLoading, setStatusesLoading] = useState(false);
  const [salesData, setSalesData] = useState<any>(null);

  const fetchStatuses = async () => {
    setStatusesLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('gestaoclick-vendas', { body: { skipCache: true } });
      if (error) throw error;

      setSalesData(data);

      // Extract unique statuses from all sales
      const statusSet = new Set<string>();
      const productSalesMap = data?.productSalesMap || {};
      for (const vendas of Object.values(productSalesMap) as any[][]) {
        for (const venda of vendas) {
          if (venda.situacao) statusSet.add(venda.situacao);
        }
      }

      // Also add situacoes from the response if available
      if (data?.situacoes) {
        for (const sit of data.situacoes) {
          if (sit.nome) statusSet.add(sit.nome);
        }
      }

      const statuses = Array.from(statusSet).sort();
      setAvailableStatuses(statuses);
      // Pre-select all by default
      setSelectedStatuses(new Set(statuses));

      toast.success(`${statuses.length} estados de venda encontrados`);
    } catch (err: any) {
      toast.error('Erro ao buscar vendas: ' + err.message);
    } finally {
      setStatusesLoading(false);
    }
  };

  const processWithSelectedStatuses = async () => {
    if (selectedStatuses.size === 0) {
      toast.warning('Selecione pelo menos um estado de venda');
      return;
    }

    setStep('loading');
    setLoading(true);

    try {
      const productSalesMap = salesData?.productSalesMap || {};
      const clientMap = new Map<string, SaleClient>();

      for (const vendas of Object.values(productSalesMap) as any[][]) {
        for (const venda of vendas) {
          // Filter by selected statuses
          if (!selectedStatuses.has(venda.situacao)) continue;

          const clientKey = venda.cliente_nome?.toLowerCase().trim();
          if (!clientKey || clientKey === 'n/a') continue;

          // Try cliente_cep first, then extract from address
          let postalCode = (venda.cliente_cep || '').trim();
          if (!postalCode) {
            postalCode = extractPostalCode(venda.cliente_endereco || '');
          }
          if (!postalCode) continue;

          if (!clientMap.has(clientKey)) {
            clientMap.set(clientKey, {
              clientName: venda.cliente_nome,
              address: venda.cliente_endereco || '',
              postalCode,
              city: venda.cliente_cidade || '',
              vendaIds: [venda.venda_id],
              vendaCodigos: [venda.codigo],
              vendaSituacoes: [venda.situacao],
              selected: true,
            });
          } else {
            const existing = clientMap.get(clientKey)!;
            if (!existing.vendaIds.includes(venda.venda_id)) {
              existing.vendaIds.push(venda.venda_id);
              existing.vendaCodigos.push(venda.codigo);
              if (!existing.vendaSituacoes.includes(venda.situacao)) {
                existing.vendaSituacoes.push(venda.situacao);
              }
            }
          }
        }
      }

      const uniqueClients = Array.from(clientMap.values());

      if (uniqueClients.length === 0) {
        toast.warning('Nenhuma venda com código postal encontrada para os estados selecionados');
        setStep('select_status');
        setLoading(false);
        return;
      }

      setGeocoding(true);
      const geocoded = await geocodeClients(uniqueClients);
      setGeocoding(false);

      const optimized = optimizeRoute(geocoded);
      setClients(optimized);
      setRouteName(`Rota ${new Date().toLocaleDateString('pt-PT')}`);
      setStep('results');

      toast.success(`${optimized.length} clientes encontrados e rota otimizada!`);
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
      setStep('select_status');
    } finally {
      setLoading(false);
      setGeocoding(false);
    }
  };

  const geocodeClients = async (clientsList: SaleClient[]): Promise<SaleClient[]> => {
    const results: SaleClient[] = [];
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
      } catch { /* ignore */ }
      results.push(client);
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
      dist += haversineDistance(withCoords[i - 1].lat!, withCoords[i - 1].lon!, withCoords[i].lat!, withCoords[i].lon!);
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

  const toggleStatus = (status: string) => {
    setSelectedStatuses(prev => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  const selectAllStatuses = () => setSelectedStatuses(new Set(availableStatuses));
  const deselectAllStatuses = () => setSelectedStatuses(new Set());

  const postalGroups = new Map<string, number>();
  clients.forEach(c => {
    const prefix = getPostalPrefix(c.postalCode);
    postalGroups.set(prefix, (postalGroups.get(prefix) || 0) + 1);
  });

  const handleReset = () => {
    setStep('select_status');
    setClients([]);
    setRouteName('');
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setStep('select_status'); setClients([]); setSalesData(null); setAvailableStatuses([]); } onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Route className="h-5 w-5 text-primary" />
            Sugerir Rota a partir de Vendas
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: Select statuses */}
        {step === 'select_status' && (
          <div className="flex flex-col gap-4">
            {availableStatuses.length === 0 ? (
              <div className="flex flex-col items-center gap-4 py-8">
                <Truck className="h-16 w-16 text-muted-foreground/50" />
                <p className="text-muted-foreground text-center">
                  Primeiro vamos buscar as vendas para ver os estados disponíveis.
                </p>
                <Button onClick={fetchStatuses} disabled={statusesLoading} size="lg">
                  {statusesLoading ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" />A buscar vendas...</>
                  ) : (
                    <><RefreshCw className="h-4 w-4 mr-2" />Buscar Vendas</>
                  )}
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold flex items-center gap-2">
                      <Filter className="h-4 w-4" />
                      Selecione os estados de venda
                    </Label>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={selectAllStatuses}>
                        Todos
                      </Button>
                      <Button variant="ghost" size="sm" onClick={deselectAllStatuses}>
                        Nenhum
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto border rounded-lg p-3">
                    {availableStatuses.map((status) => (
                      <div
                        key={status}
                        className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                          selectedStatuses.has(status)
                            ? 'bg-primary/10 border-primary/30'
                            : 'hover:bg-accent/50'
                        }`}
                        onClick={() => toggleStatus(status)}
                      >
                        <Checkbox checked={selectedStatuses.has(status)} />
                        <span className="text-sm font-medium">{status}</span>
                      </div>
                    ))}
                  </div>

                  <p className="text-sm text-muted-foreground text-center">
                    {selectedStatuses.size} de {availableStatuses.length} estados selecionados
                  </p>
                </div>

                <DialogFooter>
                  <Button
                    onClick={processWithSelectedStatuses}
                    disabled={selectedStatuses.size === 0}
                    size="lg"
                  >
                    <Route className="h-4 w-4 mr-2" />
                    Gerar Rota com Estados Selecionados
                  </Button>
                </DialogFooter>
              </>
            )}
          </div>
        )}

        {/* Step 2: Loading */}
        {step === 'loading' && (
          <div className="flex flex-col items-center gap-4 py-12">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-muted-foreground font-medium">
              {geocoding ? 'A geocodificar códigos postais...' : 'A processar vendas...'}
            </p>
            {geocoding && (
              <p className="text-xs text-muted-foreground">Pode demorar alguns segundos (1 req/seg)</p>
            )}
          </div>
        )}

        {/* Step 3: Results */}
        {step === 'results' && (
          <>
            <div className="flex-1 overflow-hidden flex flex-col gap-4">
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

              {/* Summary with selected statuses */}
              <div className="flex gap-2 flex-wrap">
                <Badge variant="outline" className="text-sm py-1 px-3">
                  <MapPin className="h-3 w-3 mr-1" />
                  {selectedClients.length} paragens
                </Badge>
                <Badge variant="outline" className="text-sm py-1 px-3">
                  <Route className="h-3 w-3 mr-1" />
                  ~{totalDistance.toFixed(0)} km
                </Badge>
                <Badge variant="outline" className="text-sm py-1 px-3">
                  📮 {postalGroups.size} zonas
                </Badge>
                <Badge variant="secondary" className="text-sm py-1 px-3">
                  <Filter className="h-3 w-3 mr-1" />
                  {selectedStatuses.size} estados
                </Badge>
              </div>

              {/* Client list */}
              <div className="overflow-y-auto flex-1 space-y-1 max-h-[300px] border rounded-lg p-2">
                {clients.map((client, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-3 p-2.5 rounded-lg border transition-colors ${
                      client.selected ? 'bg-accent/30 border-primary/20' : 'opacity-50'
                    }`}
                  >
                    <Checkbox checked={client.selected} onCheckedChange={() => toggleClient(idx)} />
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
                      <div className="flex gap-1 mt-0.5 flex-wrap">
                        {client.vendaSituacoes.map((sit, i) => (
                          <Badge key={i} variant="outline" className="text-[10px] py-0 px-1.5">
                            {sit}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-xs shrink-0">
                      {client.vendaCodigos.length} venda{client.vendaCodigos.length > 1 ? 's' : ''}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleReset}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Alterar Estados
              </Button>
              <Button onClick={handleCreateRoute} disabled={selectedClients.length === 0 || !routeName.trim()}>
                <Route className="h-4 w-4 mr-1" />
                Criar Rota ({selectedClients.length} paragens)
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
