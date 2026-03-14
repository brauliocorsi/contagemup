import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, MapPin, Route, Truck, RefreshCw, Filter } from 'lucide-react';
import { toast } from 'sonner';
import { useDeliveryRegions, DeliveryRegion, getWeekdayName } from '@/hooks/useDeliveryRegions';

interface SaleClient {
  clientName: string;
  clienteId?: string;
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

interface RegionalRouteBuilderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateRoute: (data: {
    name: string;
    scheduled_date: string;
    region_id?: string;
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
      freguesia?: string;
      municipio?: string;
    }[];
  }) => void;
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

function optimizeRoute(clients: SaleClient[]): SaleClient[] {
  // Sort by postal code ascending for logical geographic grouping
  return [...clients].sort((a, b) => {
    const cpA = a.postalCode.replace(/[^0-9]/g, '');
    const cpB = b.postalCode.replace(/[^0-9]/g, '');
    return cpA.localeCompare(cpB);
  });
}

function extractPostalCode(text: string): string {
  if (!text) return '';
  const match = text.match(/\d{4}-\d{3}/);
  return match ? match[0] : '';
}

function getNextWeekday(weekday: number): string {
  const now = new Date();
  const current = now.getDay();
  let daysAhead = weekday - current;
  if (daysAhead <= 0) daysAhead += 7;
  const next = new Date(now);
  next.setDate(now.getDate() + daysAhead);
  return next.toISOString().split('T')[0];
}

type Step = 'select_region' | 'select_status' | 'loading' | 'results';

export function RegionalRouteBuilder({ open, onOpenChange, onCreateRoute }: RegionalRouteBuilderProps) {
  const { regions } = useDeliveryRegions();
  const [step, setStep] = useState<Step>('select_region');
  const [selectedRegion, setSelectedRegion] = useState<DeliveryRegion | null>(null);
  const [loading, setLoading] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [clients, setClients] = useState<SaleClient[]>([]);
  const [routeName, setRouteName] = useState('');
  const [routeDate, setRouteDate] = useState(new Date().toISOString().split('T')[0]);

  const [availableStatuses, setAvailableStatuses] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());
  const [statusesLoading, setStatusesLoading] = useState(false);
  const [salesData, setSalesData] = useState<any>(null);

  const handleSelectRegion = (regionId: string) => {
    const region = regions.find(r => r.id === regionId) || null;
    setSelectedRegion(region);
    if (region?.default_weekday !== null && region?.default_weekday !== undefined) {
      setRouteDate(getNextWeekday(region.default_weekday));
    }
  };

  const fetchStatuses = async () => {
    setStatusesLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('gestaoclick-vendas', { body: { skipCache: true } });
      if (error) throw error;
      setSalesData(data);

      const statusSet = new Set<string>();
      const productSalesMap = data?.productSalesMap || {};
      for (const vendas of Object.values(productSalesMap) as any[][]) {
        for (const venda of vendas) {
          if (venda.situacao) statusSet.add(venda.situacao);
        }
      }
      if (data?.situacoes) {
        for (const sit of data.situacoes) {
          if (sit.nome) statusSet.add(sit.nome);
        }
      }
      const statuses = Array.from(statusSet).sort();
      setAvailableStatuses(statuses);
      setSelectedStatuses(new Set(statuses));
      toast.success(`${statuses.length} estados encontrados`);
    } catch (err: any) {
      toast.error('Erro ao buscar vendas: ' + err.message);
    } finally {
      setStatusesLoading(false);
    }
  };

  const processWithSelectedStatuses = async () => {
    if (selectedStatuses.size === 0) { toast.warning('Selecione pelo menos um estado'); return; }
    setStep('loading');
    setLoading(true);

    try {
      const { data: clientsData, error: clientsError } = await supabase.functions.invoke('gestaoclick-clients', { body: {} });
      if (clientsError) throw clientsError;

      const clientLookup = new Map<string, { endereco: string; cep: string; cidade: string }>();
      for (const client of (clientsData?.clients || [])) {
        clientLookup.set(client.id, {
          endereco: client.endereco || '',
          cep: client.cep || '',
          cidade: client.cidade || '',
        });
      }

      const productSalesMap = salesData?.productSalesMap || {};
      const clientMap = new Map<string, SaleClient>();

      for (const vendas of Object.values(productSalesMap) as any[][]) {
        for (const venda of vendas) {
          if (!selectedStatuses.has(venda.situacao)) continue;
          const clientKey = venda.cliente_nome?.toLowerCase().trim();
          if (!clientKey || clientKey === 'n/a') continue;

          const clientInfo = clientLookup.get(venda.cliente_id || '') || null;
          let postalCode = clientInfo?.cep || '';
          if (!postalCode) postalCode = (venda.cliente_cep || '').trim();
          if (!postalCode) postalCode = extractPostalCode(clientInfo?.endereco || '');
          if (!postalCode) postalCode = extractPostalCode(venda.cliente_endereco || '');
          if (!postalCode) continue;

          // Filter by region if selected
          if (selectedRegion) {
            const prefix = parseInt(postalCode.replace(/[^0-9]/g, '').substring(0, 4));
            const start = parseInt(selectedRegion.postal_prefix_start);
            const end = parseInt(selectedRegion.postal_prefix_end);
            if (isNaN(prefix) || prefix < start || prefix > end) continue;
          }

          const address = clientInfo?.endereco || venda.cliente_endereco || '';
          const city = clientInfo?.cidade || venda.cliente_cidade || '';

          if (!clientMap.has(clientKey)) {
            clientMap.set(clientKey, {
              clientName: venda.cliente_nome,
              clienteId: venda.cliente_id,
              address, postalCode, city,
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
        toast.warning(selectedRegion
          ? `Nenhuma venda encontrada na região ${selectedRegion.name}`
          : 'Nenhuma venda com código postal encontrada');
        setStep('select_status');
        setLoading(false);
        return;
      }

      setGeocoding(true);
      const geocoded = await geocodeClients(uniqueClients);
      setGeocoding(false);

      const optimized = optimizeRoute(geocoded);
      setClients(optimized);
      setRouteName(selectedRegion ? `${selectedRegion.name} - ${new Date(routeDate).toLocaleDateString('pt-PT')}` : `Rota ${new Date().toLocaleDateString('pt-PT')}`);
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
        const cp = client.postalCode.replace(/[^0-9-]/g, '');
        const response = await fetch(`https://geoapi.pt/cp/${cp}?json=1`);
        if (response.ok) {
          const data = await response.json();
          if (data) {
            if (data.lat || data.latitude) client.lat = parseFloat(String(data.lat || data.latitude));
            if (data.lng || data.lon || data.longitude) client.lon = parseFloat(String(data.lng || data.lon || data.longitude));
            if (data.Freguesia || data.freguesia) client.freguesia = data.Freguesia || data.freguesia;
            if (data.Concelho || data.concelho || data.Municipio || data.municipio) client.municipio = data.Concelho || data.concelho || data.Municipio || data.municipio;
            if (!client.city && client.municipio) client.city = client.municipio;
          }
        }
      } catch { /* ignore */ }
      results.push(client);
      if (i < clientsList.length - 1) await new Promise(r => setTimeout(r, 500));
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
      region_id: selectedRegion?.id,
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
        freguesia: c.freguesia,
        municipio: c.municipio,
      })),
    });
  };

  const toggleClient = (idx: number) => {
    setClients(prev => prev.map((c, i) => i === idx ? { ...c, selected: !c.selected } : c));
  };

  const toggleStatus = (status: string) => {
    setSelectedStatuses(prev => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status); else next.add(status);
      return next;
    });
  };

  const handleReset = () => { setStep('select_region'); setClients([]); setSalesData(null); setAvailableStatuses([]); setSelectedRegion(null); };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleReset(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Route className="h-5 w-5 text-primary" />
            Construir Rota Regional
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: Select Region */}
        {step === 'select_region' && (
          <div className="flex flex-col gap-4">
            <div className="space-y-3">
              <Label className="text-base font-semibold">Selecione a Região</Label>
              {regions.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma região configurada. Configure regiões primeiro.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {regions.map(region => (
                    <div
                      key={region.id}
                      className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                        selectedRegion?.id === region.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'
                      }`}
                      onClick={() => handleSelectRegion(region.id)}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: region.color }} />
                        <span className="font-medium">{region.name}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {region.postal_prefix_start}–{region.postal_prefix_end}
                        {region.default_weekday !== null && ` • ${getWeekdayName(region.default_weekday)}`}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              <div className="border-t pt-3">
                <p className="text-xs text-muted-foreground mb-2">Ou avançar sem filtro regional (todas as vendas)</p>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => { setStep('select_status'); if (availableStatuses.length === 0) fetchStatuses(); }}>
                {selectedRegion ? `Avançar com ${selectedRegion.name}` : 'Avançar sem Filtro Regional'}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 2: Select statuses */}
        {step === 'select_status' && (
          <div className="flex flex-col gap-4">
            {selectedRegion && (
              <Badge className="self-start text-sm py-1 px-3" style={{ backgroundColor: selectedRegion.color, color: 'white' }}>
                <MapPin className="h-3 w-3 mr-1" />
                {selectedRegion.name} ({selectedRegion.postal_prefix_start}–{selectedRegion.postal_prefix_end})
              </Badge>
            )}
            {availableStatuses.length === 0 ? (
              <div className="flex flex-col items-center gap-4 py-8">
                <Truck className="h-16 w-16 text-muted-foreground/50" />
                <p className="text-muted-foreground text-center">A buscar vendas disponíveis...</p>
                {statusesLoading && <Loader2 className="h-6 w-6 animate-spin text-primary" />}
                {!statusesLoading && (
                  <Button onClick={fetchStatuses}><RefreshCw className="h-4 w-4 mr-2" />Buscar Vendas</Button>
                )}
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold flex items-center gap-2">
                      <Filter className="h-4 w-4" />Estados de Venda
                    </Label>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setSelectedStatuses(new Set(availableStatuses))}>Todos</Button>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedStatuses(new Set())}>Nenhum</Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto border rounded-lg p-3">
                    {availableStatuses.map((status) => (
                      <div
                        key={status}
                        className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                          selectedStatuses.has(status) ? 'bg-primary/10 border-primary/30' : 'hover:bg-accent/50'
                        }`}
                        onClick={() => toggleStatus(status)}
                      >
                        <Checkbox checked={selectedStatuses.has(status)} />
                        <span className="text-sm font-medium">{status}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground text-center">{selectedStatuses.size} de {availableStatuses.length} estados</p>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setStep('select_region')}>Voltar</Button>
                  <Button onClick={processWithSelectedStatuses} disabled={selectedStatuses.size === 0}>
                    <Route className="h-4 w-4 mr-2" />Gerar Rota
                  </Button>
                </DialogFooter>
              </>
            )}
          </div>
        )}

        {/* Step 3: Loading */}
        {step === 'loading' && (
          <div className="flex flex-col items-center gap-4 py-12">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-muted-foreground font-medium">
              {geocoding ? 'A geocodificar códigos postais...' : 'A processar vendas...'}
            </p>
          </div>
        )}

        {/* Step 4: Results */}
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

              <div className="flex gap-2 flex-wrap">
                {selectedRegion && (
                  <Badge className="text-sm py-1 px-3" style={{ backgroundColor: selectedRegion.color, color: 'white' }}>
                    {selectedRegion.name}
                  </Badge>
                )}
                <Badge variant="outline" className="text-sm py-1 px-3">
                  <MapPin className="h-3 w-3 mr-1" />{selectedClients.length} paragens
                </Badge>
                <Badge variant="outline" className="text-sm py-1 px-3">
                  <Route className="h-3 w-3 mr-1" />~{totalDistance.toFixed(0)} km
                </Badge>
              </div>

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
                        {client.freguesia && <span>• {client.freguesia}</span>}
                        {client.municipio && <span>• {client.municipio}</span>}
                        {client.lat && <span className="text-green-600">✓ GPS</span>}
                      </div>
                      <div className="flex gap-1 mt-0.5 flex-wrap">
                        {client.vendaSituacoes.map((sit, i) => (
                          <Badge key={i} variant="outline" className="text-[10px] py-0 px-1.5">{sit}</Badge>
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
                <RefreshCw className="h-4 w-4 mr-1" />Recomeçar
              </Button>
              <Button onClick={handleCreateRoute} disabled={selectedClients.length === 0 || !routeName.trim()}>
                <Route className="h-4 w-4 mr-1" />Criar Rota ({selectedClients.length} paragens)
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
