import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ClipboardCopy, ClipboardPaste, MapPin, Save, Send, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  applyExternalPlan,
  fetchSeparationOrders,
  optimizeWeekRoutes,
  type OptimizeStop,
} from '@/lib/logistics/api';
import { buildAiPrompt, parseAiPlan } from '@/lib/logistics/ai-route-plan';
import { DEFAULT_ADDRESS_FROM, type DayRoute, type SepOrder, type WeekPlan } from '@/lib/logistics/types';
import { useWeekPlans } from './useWeekPlans';

function today(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function workingDays(from: string, to: string): string[] {
  const out: string[] = [];
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  for (const d = start; d <= end && out.length < 14; d.setDate(d.getDate() + 1)) {
    const wd = d.getDay();
    if (wd >= 2 && wd <= 6) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function dayLabel(iso: string): string {
  const [date, ...extra] = iso.split(' · ');
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const label = d.toLocaleDateString('pt-PT', { weekday: 'long', day: '2-digit', month: '2-digit' });
  return extra.length > 0 ? `${label} · ${extra.join(' · ')}` : label;
}

function toStops(orders: SepOrder[]): OptimizeStop[] {
  return orders.map((o) => ({
    id: o.id,
    codigo: o.codigo,
    cliente: o.cliente,
    address: o.morada,
    entrega: o.entrega,
    situacao: o.situacao,
    valorEntrega: o.valorEntrega,
    valorMontagem: o.valorMontagem,
  }));
}

interface RouteOptimizationViewProps {
  onSendToSeparation?: () => void;
}

export function RouteOptimizationView({ onSendToSeparation }: RouteOptimizationViewProps) {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today(6));
  const [addressFrom, setAddressFrom] = useState(DEFAULT_ADDRESS_FROM);
  const [maxPerDay, setMaxPerDay] = useState(8);
  const [maxRunsPerDay, setMaxRunsPerDay] = useState(2);
  const [consumption, setConsumption] = useState(12);
  const [fuelPrice, setFuelPrice] = useState(1.6);
  const [orders, setOrders] = useState<SepOrder[]>([]);
  const [plan, setPlan] = useState<WeekPlan | null>(null);
  const [planName, setPlanName] = useState('');
  const [aiText, setAiText] = useState('');

  const { plans: saved, save, remove } = useWeekPlans();
  const days = useMemo(() => workingDays(from, to), [from, to]);

  const dayGroups = useMemo(() => {
    const groups = new Map<string, DayRoute[]>();
    for (const d of plan?.days ?? []) {
      if (!groups.has(d.day)) groups.set(d.day, []);
      groups.get(d.day)!.push(d);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [plan]);

  const load = useMutation({
    mutationFn: () => fetchSeparationOrders(from, to),
    onSuccess: (res) => {
      setOrders(res.orders);
      setPlan(null);
      toast.success(`${res.orders.length} encomenda(s) com entrega neste período`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const job = useMutation({
    mutationFn: async () => {
      const list = orders.length > 0 ? orders : (await fetchSeparationOrders(from, to)).orders;
      setOrders(list);
      if (list.length === 0) throw new Error('Nenhuma encomenda com entrega neste período');
      return optimizeWeekRoutes({
        origin: addressFrom || DEFAULT_ADDRESS_FROM,
        days,
        maxPerDay,
        maxRunsPerDay,
        consumption,
        fuelPrice,
        stops: toStops(list),
      });
    },
    onSuccess: (res) => {
      setPlan(res);
      toast.success(`${res.days.length} volta(s) sugerida(s) · ${res.totalKm} km`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const copyPrompt = useMutation({
    mutationFn: async () => {
      const list = orders.length > 0 ? orders : (await fetchSeparationOrders(from, to)).orders;
      setOrders(list);
      if (list.length === 0) throw new Error('Nenhuma encomenda com entrega neste período');
      await navigator.clipboard.writeText(
        buildAiPrompt({
          origin: addressFrom || DEFAULT_ADDRESS_FROM,
          days,
          maxPerDay,
          maxRunsPerDay,
          consumption,
          fuelPrice,
          orders: list,
        }),
      );
      return list.length;
    },
    onSuccess: (n) => toast.success(`Lista de ${n} encomenda(s) copiada — cole no ChatGPT ou Claude`),
    onError: (e: Error) => toast.error(e.message),
  });

  const importPlan = useMutation({
    mutationFn: async () => {
      const assignments = parseAiPlan(aiText);
      if (assignments.length === 0)
        throw new Error('Não consegui ler o plano. Use linhas AAAA-MM-DD;volta;codigo');
      const list = orders.length > 0 ? orders : (await fetchSeparationOrders(from, to)).orders;
      setOrders(list);
      return applyExternalPlan({
        origin: addressFrom || DEFAULT_ADDRESS_FROM,
        consumption,
        fuelPrice,
        assignments,
        stops: toStops(list),
      });
    },
    onSuccess: (res) => {
      setPlan(res);
      toast.success(`Plano importado · ${res.days.length} volta(s) · ${res.totalKm} km`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const savePlan = useMutation({
    mutationFn: async () => {
      if (!plan) throw new Error('Otimize a semana antes de guardar');
      await save({ name: planName.trim() || `Semana ${from} a ${to}`, from, to, plan });
    },
    onSuccess: () => {
      setPlanName('');
      toast.success('Otimização guardada');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function sendToSeparation() {
    const ids = (plan?.days ?? []).flatMap((d) => d.stops.map((s) => s.id));
    if (ids.length === 0) {
      toast.error('Otimize a semana antes de enviar para separação');
      return;
    }
    localStorage.setItem('separacao:preselect', JSON.stringify({ from, to, ids }));
    toast.success(`${ids.length} nota(s) enviadas para separação`);
    onSendToSeparation?.();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-xl font-bold tracking-tight">Otimizar a Semana</h1>
        <p className="text-sm text-muted-foreground">Rotas diárias por proximidade de código postal</p>
      </div>

      <div className="grid gap-4 rounded-lg border bg-card p-4 md:grid-cols-7">
        <div>
          <Label htmlFor="de">Entrega de</Label>
          <Input id="de" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="ate">até</Label>
          <Input id="ate" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="carga">Morada de carga</Label>
          <Input id="carga" value={addressFrom} onChange={(e) => setAddressFrom(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="max">Entregas / volta</Label>
          <Input id="max" type="number" min={1} value={maxPerDay} onChange={(e) => setMaxPerDay(Number(e.target.value))} />
        </div>
        <div>
          <Label htmlFor="runs">Voltas / dia</Label>
          <Input id="runs" type="number" min={1} max={3} value={maxRunsPerDay} onChange={(e) => setMaxRunsPerDay(Number(e.target.value))} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="cons">L/100km</Label>
            <Input id="cons" type="number" step="0.1" value={consumption} onChange={(e) => setConsumption(Number(e.target.value))} />
          </div>
          <div>
            <Label htmlFor="preco">€/L</Label>
            <Input id="preco" type="number" step="0.01" value={fuelPrice} onChange={(e) => setFuelPrice(Number(e.target.value))} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => load.mutate()} disabled={load.isPending}>
          {load.isPending ? 'A carregar…' : 'Carregar encomendas'}
        </Button>
        <Button onClick={() => job.mutate()} disabled={job.isPending}>
          <Sparkles className="mr-2 h-4 w-4" />
          {job.isPending ? 'A otimizar…' : 'Otimizar a semana'}
        </Button>
        <Button variant="outline" onClick={() => copyPrompt.mutate()} disabled={copyPrompt.isPending}>
          <ClipboardCopy className="mr-2 h-4 w-4" />
          {copyPrompt.isPending ? 'A preparar…' : 'Copiar lista para IA'}
        </Button>
        {plan && (
          <>
            <Input className="w-56" placeholder="Nome da otimização" value={planName} onChange={(e) => setPlanName(e.target.value)} />
            <Button variant="outline" onClick={() => savePlan.mutate()} disabled={savePlan.isPending}>
              <Save className="mr-2 h-4 w-4" />
              {savePlan.isPending ? 'A guardar…' : 'Guardar otimização'}
            </Button>
            <Button variant="secondary" onClick={sendToSeparation}>
              <Send className="mr-2 h-4 w-4" />
              Enviar para separação
            </Button>
          </>
        )}
        {orders.length > 0 && (
          <span className="text-sm text-muted-foreground">
            {orders.length} encomenda(s) · {days.length} dia(s) úteis · até {maxPerDay * maxRunsPerDay} entregas/dia
          </span>
        )}
      </div>

      {saved.length > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <h2 className="mb-2 font-semibold">Otimizações guardadas</h2>
          <ul className="divide-y text-sm">
            {saved.map((sp) => (
              <li key={sp.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="font-medium">{sp.name}</span>
                <span className="text-muted-foreground">
                  {sp.dateFrom} a {sp.dateTo} · {sp.plan?.days?.length ?? 0} volta(s) ·{' '}
                  {new Date(sp.createdAt).toLocaleString('pt-PT')}
                </span>
                <div className="ml-auto flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setPlan(sp.plan);
                      setFrom(sp.dateFrom);
                      setTo(sp.dateTo);
                      toast.success(`Otimização "${sp.name}" carregada`);
                    }}
                  >
                    Abrir
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void remove(sp.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg border bg-card p-4">
        <h2 className="mb-1 flex items-center gap-2 font-semibold">
          <ClipboardPaste className="h-4 w-4" /> Plano da IA
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Copie a lista, peça a otimização ao ChatGPT ou Claude e cole aqui a resposta (uma linha por
          paragem: <code>AAAA-MM-DD;volta;codigo</code>).
        </p>
        <Textarea
          rows={6}
          value={aiText}
          onChange={(e) => setAiText(e.target.value)}
          placeholder={'2026-08-18;1;12345\n2026-08-18;1;12346\n2026-08-19;2;12350'}
          className="font-mono text-xs"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => importPlan.mutate()} disabled={importPlan.isPending || !aiText.trim()}>
            {importPlan.isPending ? 'A recarregar…' : 'Recarregar plano da IA'}
          </Button>
          <Button variant="ghost" onClick={() => setAiText('')} disabled={!aiText}>
            Limpar
          </Button>
        </div>
      </div>

      {plan && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="rounded-lg border bg-card p-4">
              <p className="text-sm text-muted-foreground">Distância total</p>
              <p className="text-2xl font-bold">{plan.totalKm} km</p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <p className="text-sm text-muted-foreground">Gasóleo estimado</p>
              <p className="text-2xl font-bold">{plan.totalCost.toFixed(2)} €</p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <p className="text-sm text-muted-foreground">Sem otimização (por data)</p>
              <p className="text-2xl font-bold">{plan.baselineKm} km</p>
              <p className="text-xs text-muted-foreground">{plan.baselineCost.toFixed(2)} €</p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <p className="text-sm text-muted-foreground">Poupança</p>
              <p className="text-2xl font-bold text-emerald-600">
                {Math.max(0, Math.round((plan.baselineKm - plan.totalKm) * 10) / 10)} km
              </p>
              <p className="text-xs text-muted-foreground">
                {Math.max(0, Math.round((plan.baselineCost - plan.totalCost) * 100) / 100).toFixed(2)} € ·{' '}
                {plan.movedCount} encomenda(s) movida(s)
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border bg-card p-4">
              <p className="text-sm text-muted-foreground">Serviços de entrega</p>
              <p className="text-xl font-bold">{plan.entregaTotal.toFixed(2)} €</p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <p className="text-sm text-muted-foreground">Serviços de montagem</p>
              <p className="text-xl font-bold">{plan.montagemTotal.toFixed(2)} €</p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <p className="text-sm text-muted-foreground">Total de serviços</p>
              <p className="text-xl font-bold">{plan.servicoTotal.toFixed(2)} €</p>
            </div>
          </div>

          {plan.suggestions.length > 0 && (
            <div className="rounded-lg border bg-card p-4">
              <h2 className="mb-2 font-semibold">Sugestões</h2>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {plan.suggestions.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-4">
            {dayGroups.map(([day, runs]) => (
              <div key={day} className="rounded-lg border bg-card p-4">
                <h3 className="mb-2 font-semibold capitalize">{dayLabel(day)}</h3>
                <div className="space-y-3">
                  {runs.map((run) => (
                    <div key={`${day}-${run.run}`} className="rounded-md border p-3">
                      <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
                        <span className="font-medium">Volta {run.run}</span>
                        <span className="text-muted-foreground">
                          {run.stops.length} paragem(ns) · {run.km} km · {run.cost.toFixed(2)} €
                        </span>
                        {run.mapsUrls.map((url, i) => (
                          <a
                            key={url}
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-primary underline"
                          >
                            <MapPin className="h-3.5 w-3.5" />
                            Mapa {run.mapsUrls.length > 1 ? i + 1 : ''}
                          </a>
                        ))}
                      </div>
                      <ol className="list-decimal space-y-1 pl-5 text-sm">
                        {run.stops.map((s) => (
                          <li key={s.id}>
                            <span className="font-medium">{s.codigo}</span> · {s.cliente} · {s.address}
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {plan.unlocated.length > 0 && (
            <div className="rounded-lg border bg-card p-4">
              <h2 className="mb-2 font-semibold">Sem morada localizável</h2>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {plan.unlocated.map((s) => (
                  <li key={s.id}>
                    {s.codigo} · {s.cliente} · {s.address || 'sem morada'}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
