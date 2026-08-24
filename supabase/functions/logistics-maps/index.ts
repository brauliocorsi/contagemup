import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

type Point = { lat: number; lng: number };

export type WeekStop = {
  id: string;
  codigo: string;
  cliente: string;
  address: string;
  postal: string;
  entrega: string;
  situacao: string;
  lat: number | null;
  lng: number | null;
  valorEntrega: number;
  valorMontagem: number;
};

type DayRoute = {
  day: string;
  date: string;
  run: number;
  stops: WeekStop[];
  km: number;
  liters: number;
  cost: number;
  mapsUrl: string;
  mapsUrls: string[];
  entregaTotal: number;
  montagemTotal: number;
  servicoTotal: number;
};

type DayComparison = { date: string; before: number; after: number; moved: number };

type RawStop = {
  id: string;
  codigo: string;
  cliente: string;
  address: string;
  entrega: string;
  situacao?: string;
  valorEntrega?: number;
  valorMontagem?: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

const geoCache = new Map<string, Point | null>();

async function geocode(address: string): Promise<Point | null> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const mapsKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!lovableKey || !mapsKey) throw new Error("Ligação ao Google Maps em falta");

  const cached = geoCache.get(address);
  if (cached !== undefined) return cached;

  const res = await fetch(
    `${GATEWAY_URL}/maps/api/geocode/json?address=${encodeURIComponent(address)}&region=pt`,
    { headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": mapsKey } },
  );

  if (res.status === 403) {
    const details: Array<{ reason?: string }> =
      ((await res.json()) as { error?: { details?: Array<{ reason?: string }> } })?.error?.details ?? [];
    const reason = details.find((d) => d.reason)?.reason;
    if (reason === "API_KEY_HTTP_REFERRER_BLOCKED") {
      throw new Error(
        'A chave do Google Maps está restrita por domínio. Na Google Cloud Console, defina as restrições da chave de servidor como "Nenhuma" ou "Endereços IP".',
      );
    }
    if (reason === "API_KEY_SERVICE_BLOCKED") {
      throw new Error(
        "A chave do Google Maps não permite a API de Geocoding. Adicione-a à lista de APIs permitidas na Google Cloud Console.",
      );
    }
    throw new Error("Pedido ao Google Maps recusado (403). Verifique as restrições da chave.");
  }

  if (!res.ok) {
    console.error(`[maps] geocode falhou [${res.status}]: ${await res.text()}`);
    geoCache.set(address, null);
    return null;
  }

  const body = (await res.json()) as {
    results?: { geometry?: { location?: Point } }[];
  };
  const loc = body.results?.[0]?.geometry?.location ?? null;
  geoCache.set(address, loc);
  return loc;
}

/** Tenta a morada completa; se falhar, tenta código postal e depois a localidade. */
async function geocodeFlexible(address: string): Promise<Point | null> {
  const clean = address.replace(/\s+/g, " ").trim();
  if (clean.length <= 3) return null;

  const tries: string[] = [clean];
  const postal = clean.match(/\d{4}-\d{3}/)?.[0];
  if (postal) {
    const after = clean.split(postal)[1]?.split(",")[0]?.trim() ?? "";
    if (after) tries.push(`${postal} ${after}, Portugal`);
    tries.push(`${postal}, Portugal`);
  }
  const parts = clean.split(",").map((p) => p.trim()).filter(Boolean);
  const localidade = parts.filter((p) => !/portugal/i.test(p)).pop();
  if (localidade && !/^\d/.test(localidade)) tries.push(`${localidade}, Portugal`);

  for (const q of [...new Set(tries)]) {
    const point = await geocode(q).catch(() => null);
    if (point) return point;
  }
  return null;
}

function haversine(a: Point, b: Point): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function nearestOrder<T extends Point>(origin: Point, pool: T[]): { ordered: T[]; km: number } {
  const rest = [...pool];
  const ordered: T[] = [];
  let cur = origin;
  let km = 0;
  while (rest.length > 0) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < rest.length; i++) {
      const d = haversine(cur, rest[i]!);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    const next = rest.splice(best, 1)[0]!;
    ordered.push(next);
    km += bestD;
    cur = { lat: next.lat, lng: next.lng };
  }
  if (ordered.length > 0) km += haversine(cur, origin);
  return { ordered, km };
}

function mapsSegments(origin: Point, stops: WeekStop[]): string[] {
  const round = (n: number) => n.toFixed(6);
  const o = `${round(origin.lat)},${round(origin.lng)}`;
  const pts = stops
    .map((s) =>
      s.lat !== null && s.lng !== null
        ? `${round(s.lat)},${round(s.lng)}`
        : s.address.replace(/\s+/g, " ").trim(),
    )
    .filter((p) => p.length > 0);

  const build = (origem: string, destino: string, meio: string[]) =>
    `https://www.google.com/maps/dir/${[origem, ...meio, destino]
      .map((p) => encodeURIComponent(p))
      .join("/")}/data=!4m2!4m1!3e0`;

  if (pts.length === 0) return [build(o, o, [])];

  const chunkSize = 10; // 9 pontos intermédios + destino
  const urls: string[] = [];
  let start = o;
  for (let i = 0; i < pts.length; i += chunkSize) {
    const chunk = pts.slice(i, i + chunkSize);
    const destino = i + chunkSize >= pts.length ? o : chunk[chunk.length - 1]!;
    const meio = i + chunkSize >= pts.length ? chunk : chunk.slice(0, -1);
    urls.push(build(start, destino, meio));
    start = destino;
  }
  return urls;
}

function serviceTotals(stops: WeekStop[]) {
  const entregaTotal = round2(stops.reduce((a, s) => a + (s.valorEntrega || 0), 0));
  const montagemTotal = round2(stops.reduce((a, s) => a + (s.valorMontagem || 0), 0));
  return { entregaTotal, montagemTotal, servicoTotal: round2(entregaTotal + montagemTotal) };
}

async function locate(raw: RawStop): Promise<WeekStop> {
  const address = (raw.address ?? "").trim();
  const point = await geocodeFlexible(address);
  return {
    id: raw.id,
    codigo: raw.codigo,
    cliente: raw.cliente,
    address,
    postal: address.match(/\d{4}-\d{3}/)?.[0] ?? "",
    entrega: raw.entrega,
    situacao: raw.situacao ?? "",
    lat: point?.lat ?? null,
    lng: point?.lng ?? null,
    valorEntrega: raw.valorEntrega ?? 0,
    valorMontagem: raw.valorMontagem ?? 0,
  };
}

function routeKm(origin: Point, seq: WeekStop[]): number {
  let km = 0;
  let cur = origin;
  for (const s of seq) {
    if (s.lat === null || s.lng === null) continue;
    km += haversine(cur, { lat: s.lat, lng: s.lng });
    cur = { lat: s.lat, lng: s.lng };
  }
  km += haversine(cur, origin);
  return km;
}

function buildComparison(
  byDate: Map<string, WeekStop[]>,
  days: DayRoute[],
): DayComparison[] {
  return [...new Set([...byDate.keys(), ...days.map((d) => d.date)])].sort().map((date) => {
    const voltas = days.filter((d) => d.date === date);
    return {
      date,
      before: byDate.get(date)?.length ?? 0,
      after: voltas.reduce((a, d) => a + d.stops.length, 0),
      moved: voltas.reduce(
        (a, d) => a + d.stops.filter((s) => s.entrega && s.entrega !== date).length,
        0,
      ),
    };
  });
}

// ---------- Rota simples de entrega ----------

async function buildDeliveryRoute(data: {
  origin: string;
  stops: { id?: string; label: string; address?: string }[];
}) {
  const origin = (data.origin ?? "").trim();
  if (origin.length < 5) throw new Error("Morada de carga inválida");
  const inputs = (data.stops ?? []).filter((s) => (s.address ?? "").trim().length > 3);
  if (inputs.length === 0) throw new Error("Nenhuma encomenda com morada selecionada");
  if (inputs.length > 40) throw new Error("Selecione no máximo 40 encomendas para a rota");

  const originPoint = await geocode(origin);

  const located = [] as { label: string; address: string; lat: number | null; lng: number | null }[];
  for (const s of inputs) {
    const address = (s.address ?? "").trim();
    const point = await geocodeFlexible(address);
    located.push({ label: s.label, address, lat: point?.lat ?? null, lng: point?.lng ?? null });
  }

  const geocoded = located.filter((s): s is typeof s & Point => s.lat !== null && s.lng !== null);
  const ungeocoded = located.filter((s) => s.lat === null || s.lng === null);

  const ordered = originPoint ? nearestOrder(originPoint, geocoded).ordered : geocoded;
  const all = [...ordered, ...ungeocoded];

  const point = (s: (typeof all)[number]) =>
    s.lat !== null && s.lng !== null ? `${s.lat},${s.lng}` : s.address.replace(/\s+/g, " ").trim();

  const legs: string[][] = [];
  let start = originPoint ? `${originPoint.lat},${originPoint.lng}` : origin;
  for (let i = 0; i < all.length; i += 9) {
    const chunk = all.slice(i, i + 9);
    legs.push([start, ...chunk.map(point)]);
    start = point(chunk[chunk.length - 1]!);
  }

  return { origin, stops: all, legs, ungeocoded: ungeocoded.map((s) => s.label) };
}

// ---------- Otimização semanal ----------

async function optimizeWeekRoutes(input: {
  origin: string;
  days: string[];
  maxPerDay?: number;
  maxRunsPerDay?: number;
  consumption?: number;
  fuelPrice?: number;
  stops: RawStop[];
}) {
  const origin = (input.origin ?? "").trim();
  if (origin.length < 5) throw new Error("Morada de carga inválida");
  if (!Array.isArray(input.days) || input.days.length === 0) throw new Error("Sem dias úteis no período");
  if (!Array.isArray(input.stops) || input.stops.length === 0) throw new Error("Nenhuma encomenda selecionada");
  if (input.stops.length > 120) throw new Error("Selecione no máximo 120 encomendas");

  const maxPerDay = Math.max(1, Math.min(30, Math.round(input.maxPerDay || 8)));
  const maxRunsPerDay = Math.max(1, Math.min(3, Math.round(input.maxRunsPerDay || 2)));
  const consumption = input.consumption && input.consumption > 0 ? input.consumption : 12;
  const fuelPrice = input.fuelPrice && input.fuelPrice > 0 ? input.fuelPrice : 1.6;

  const originPoint = (await geocode(origin)) ?? { lat: 41.2757, lng: -8.3736 };

  const located: WeekStop[] = [];
  for (const s of input.stops) located.push(await locate(s));

  type Geo = WeekStop & Point;
  const geo = located.filter((s): s is Geo => s.lat !== null && s.lng !== null);
  const unlocated = located.filter((s) => s.lat === null || s.lng === null);

  const { ordered } = nearestOrder(originPoint, geo);

  const MERGE_KM = 25;
  const cp4 = (s: Geo) => s.postal.slice(0, 4);

  const porCp4 = new Map<string, Geo[]>();
  for (const s of ordered) {
    const key = cp4(s) || "0000";
    porCp4.set(key, [...(porCp4.get(key) ?? []), s]);
  }
  const clusters: Geo[][] = [...porCp4.values()];

  const centroid = (list: Geo[]) => ({
    lat: list.reduce((a, s) => a + s.lat, 0) / list.length,
    lng: list.reduce((a, s) => a + s.lng, 0) / list.length,
  });
  const prefixo = (list: Geo[], n: number) => (cp4(list[0]!) || "0000").slice(0, n);

  let fundiu = true;
  while (fundiu) {
    fundiu = false;
    outer: for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const a = clusters[i]!;
        const b = clusters[j]!;
        if (a.length + b.length > maxPerDay) continue;
        if (prefixo(a, 2) !== prefixo(b, 2)) continue;
        if (haversine(centroid(a), centroid(b)) > MERGE_KM) continue;
        clusters[i] = [...a, ...b];
        clusters.splice(j, 1);
        fundiu = true;
        break outer;
      }
    }
  }

  const datas = [...new Set(input.days)].sort();
  const alocado = new Map<string, Geo[][]>(datas.map((d) => [d, []]));
  const totalNoDia = (runs: Geo[][]) => runs.reduce((a, r) => a + r.length, 0);

  const podeJuntarVolta = (volta: Geo[], list: Geo[]) => {
    if (volta.length + list.length > maxPerDay) return false;
    if (volta.length === 0) return true;
    if (prefixo(volta, 2) !== prefixo(list, 2)) return false;
    return haversine(centroid(volta), centroid(list)) <= MERGE_KM;
  };

  const adicionarAoDia = (dia: string, list: Geo[]): Geo[] => {
    const runs = alocado.get(dia) ?? [];
    for (const run of runs) {
      if (podeJuntarVolta(run, list)) {
        run.push(...list);
        return [];
      }
    }
    if (runs.length < maxRunsPerDay) {
      runs.push([...list]);
      alocado.set(dia, runs);
      return [];
    }
    return list;
  };

  for (const cluster of [...clusters].sort((a, b) => b.length - a.length)) {
    const freq = new Map<string, number>();
    for (const s of cluster) if (s.entrega) freq.set(s.entrega, (freq.get(s.entrega) ?? 0) + 1);
    const preferida = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? datas[0] ?? "sem-data";
    const porProximidade = [...datas].sort(
      (a, b) =>
        Math.abs(datas.indexOf(a) - datas.indexOf(preferida)) -
        Math.abs(datas.indexOf(b) - datas.indexOf(preferida)),
    );

    let resto = nearestOrder(originPoint, cluster).ordered;

    for (const dia of porProximidade) {
      if (resto.length === 0) break;
      const chunk = resto.slice(0, maxPerDay);
      if (adicionarAoDia(dia, chunk).length === 0) resto = resto.slice(maxPerDay);
    }

    while (resto.length > 0) {
      const chunk = resto.slice(0, maxPerDay);
      const diasComVaga = [...datas].sort(
        (a, b) => totalNoDia(alocado.get(a) ?? []) - totalNoDia(alocado.get(b) ?? []),
      );
      let colocado = false;
      for (const dia of diasComVaga) {
        if (adicionarAoDia(dia, chunk).length === 0) {
          resto = resto.slice(chunk.length);
          colocado = true;
          break;
        }
      }
      if (!colocado) {
        const dia = diasComVaga[0] ?? preferida;
        const runs = alocado.get(dia) ?? [];
        runs.push([...chunk]);
        alocado.set(dia, runs);
        resto = resto.slice(chunk.length);
      }
    }
  }

  const days: DayRoute[] = [];
  for (const key of datas) {
    const runs = alocado.get(key) ?? [];
    runs.forEach((run, i) => {
      if (run.length === 0) return;
      const { ordered: seq, km } = nearestOrder(originPoint, run);
      const liters = (km * consumption) / 100;
      const urls = mapsSegments(originPoint, seq);
      days.push({
        day: key,
        date: key,
        run: i + 1,
        stops: seq,
        km: Math.round(km * 10) / 10,
        liters: Math.round(liters * 10) / 10,
        cost: round2(liters * fuelPrice),
        mapsUrl: urls[0]!,
        mapsUrls: urls,
        ...serviceTotals(seq),
      });
    });
  }
  days.sort((a, b) => a.day.localeCompare(b.day) || a.run - b.run);

  const byDate = new Map<string, Geo[]>();
  for (const s of ordered) {
    const key = s.entrega || "sem-data";
    byDate.set(key, [...(byDate.get(key) ?? []), s]);
  }
  let baselineKm = 0;
  for (const list of byDate.values()) baselineKm += nearestOrder(originPoint, list).km;

  const totalKm = days.reduce((a, d) => a + d.km, 0);
  const totalCost = round2(days.reduce((a, d) => a + d.cost, 0));

  const suggestions: string[] = [];
  if (baselineKm > totalKm + 1) {
    const savedKm = Math.round((baselineKm - totalKm) * 10) / 10;
    const savedCost = round2(((savedKm * consumption) / 100) * fuelPrice);
    suggestions.push(
      `Agrupar por proximidade poupa ~${savedKm} km (~${savedCost} €) face a entregar por data original.`,
    );
  }
  for (const d of days) {
    const dates = new Set(d.stops.map((s) => s.entrega).filter(Boolean));
    const movers = d.stops.filter((s) => s.entrega && s.entrega !== d.day);
    if (dates.size > 1 && movers.length > 0) {
      suggestions.push(
        `${d.day}: mover ${movers.length} encomenda(s) (${movers.slice(0, 4).map((s) => s.codigo).join(", ")}${movers.length > 4 ? "…" : ""}) para esta volta — ficam no mesmo trajeto.`,
      );
    }
    if (d.km > 250) suggestions.push(`${d.day}: volta longa (${d.km} km) — considere dividir em dois dias.`);
    if (d.stops.length <= 2 && days.length > 1) {
      suggestions.push(`${d.day}: só ${d.stops.length} paragem(ns) — junte a outro dia para poupar uma saída.`);
    }
  }
  const zonas = new Map<string, number>();
  for (const s of ordered) {
    const z = s.postal.slice(0, 4);
    if (z) zonas.set(z, (zonas.get(z) ?? 0) + 1);
  }
  const disperso = [...zonas.entries()].filter(([, n]) => n === 1).length;
  if (disperso >= 3) {
    suggestions.push(
      `${disperso} códigos postais com uma única entrega — se possível, adie-os para juntar mais entregas na mesma zona.`,
    );
  }
  if (unlocated.length > 0) {
    suggestions.push(
      `${unlocated.length} encomenda(s) sem morada localizável — confirme a morada na Gestão Click.`,
    );
  }

  const comparison = buildComparison(byDate as Map<string, WeekStop[]>, days);

  return {
    origin,
    days,
    unlocated,
    suggestions,
    totalKm: Math.round(totalKm * 10) / 10,
    totalCost,
    baselineKm: Math.round(baselineKm * 10) / 10,
    baselineCost: round2(((baselineKm * consumption) / 100) * fuelPrice),
    movedCount: comparison.reduce((a, c) => a + c.moved, 0),
    comparison,
    ...serviceTotals(days.flatMap((d) => d.stops)),
  };
}

// ---------- Plano vindo de uma IA externa ----------

async function applyExternalPlan(input: {
  origin: string;
  consumption?: number;
  fuelPrice?: number;
  assignments: { date: string; run: number; codigo: string }[];
  stops: RawStop[];
}) {
  const origin = (input.origin ?? "").trim();
  if (origin.length < 5) throw new Error("Morada de carga inválida");
  if (!Array.isArray(input.assignments) || input.assignments.length === 0)
    throw new Error("Não consegui ler nenhuma linha do plano colado");
  if (!Array.isArray(input.stops) || input.stops.length === 0)
    throw new Error("Carregue primeiro as encomendas do período");

  const consumption = input.consumption && input.consumption > 0 ? input.consumption : 12;
  const fuelPrice = input.fuelPrice && input.fuelPrice > 0 ? input.fuelPrice : 1.6;
  const originPoint = (await geocode(origin)) ?? { lat: 41.2757, lng: -8.3736 };

  const byCode = new Map(input.stops.map((s) => [String(s.codigo).trim().toUpperCase(), s]));
  const cache = new Map<string, WeekStop>();
  const resolve = async (raw: RawStop) => {
    const key = String(raw.codigo).trim().toUpperCase();
    const hit = cache.get(key);
    if (hit) return hit;
    const stop = await locate(raw);
    cache.set(key, stop);
    return stop;
  };

  const groups = new Map<string, WeekStop[]>();
  const desconhecidos: string[] = [];
  for (const a of input.assignments) {
    const raw = byCode.get(String(a.codigo).trim().toUpperCase());
    if (!raw) {
      desconhecidos.push(a.codigo);
      continue;
    }
    const stop = await resolve(raw);
    const key = `${a.date}|${a.run}`;
    groups.set(key, [...(groups.get(key) ?? []), stop]);
  }

  const usados = new Set([...groups.values()].flat().map((s) => s.codigo));
  const foraDoPlano: WeekStop[] = [];
  for (const raw of input.stops) {
    if (usados.has(raw.codigo)) continue;
    foraDoPlano.push(await resolve(raw));
  }

  const days: DayRoute[] = [];
  for (const [key, seq] of groups) {
    const [date, runRaw] = key.split("|");
    const km = routeKm(originPoint, seq);
    const liters = (km * consumption) / 100;
    const urls = mapsSegments(originPoint, seq);
    days.push({
      day: date!,
      date: date!,
      run: Number(runRaw) || 1,
      stops: seq,
      km: Math.round(km * 10) / 10,
      liters: Math.round(liters * 10) / 10,
      cost: round2(liters * fuelPrice),
      mapsUrl: urls[0]!,
      mapsUrls: urls,
      ...serviceTotals(seq),
    });
  }
  days.sort((a, b) => a.day.localeCompare(b.day) || a.run - b.run);

  const byDate = new Map<string, WeekStop[]>();
  for (const s of [...groups.values()].flat()) {
    const k = s.entrega || "sem-data";
    byDate.set(k, [...(byDate.get(k) ?? []), s]);
  }
  let baselineKm = 0;
  for (const list of byDate.values()) baselineKm += routeKm(originPoint, list);

  const totalKm = days.reduce((a, d) => a + d.km, 0);
  const suggestions = ["Plano importado de uma IA externa (não recalculado)."];
  if (desconhecidos.length > 0) {
    suggestions.push(
      `${desconhecidos.length} código(s) do plano não existem nas encomendas carregadas: ${[...new Set(desconhecidos)].slice(0, 8).join(", ")}`,
    );
  }
  if (foraDoPlano.length > 0) {
    suggestions.push(
      `${foraDoPlano.length} encomenda(s) carregada(s) ficaram fora do plano colado: ${foraDoPlano.slice(0, 8).map((s) => s.codigo).join(", ")}`,
    );
  }

  const comparison = buildComparison(byDate, days);

  return {
    origin,
    days,
    unlocated: [...groups.values()].flat().filter((s) => s.lat === null || s.lng === null),
    suggestions,
    totalKm: Math.round(totalKm * 10) / 10,
    totalCost: round2(days.reduce((a, d) => a + d.cost, 0)),
    baselineKm: Math.round(baselineKm * 10) / 10,
    baselineCost: round2(((baselineKm * consumption) / 100) * fuelPrice),
    movedCount: comparison.reduce((a, c) => a + c.moved, 0),
    comparison,
    ...serviceTotals(days.flatMap((d) => d.stops)),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const authClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: claims, error: claimsErr } = await authClient.auth.getClaims(
    authHeader.replace("Bearer ", ""),
  );
  if (claimsErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);

  try {
    const body = (await req.json().catch(() => ({}))) as { action?: string } & Record<string, never>;
    const action = body.action ?? "";
    const payload = body as unknown as Record<string, never>;

    if (action === "route") return json(await buildDeliveryRoute(payload as never));
    if (action === "optimize") return json(await optimizeWeekRoutes(payload as never));
    if (action === "apply") return json(await applyExternalPlan(payload as never));
    return json({ error: `Ação desconhecida: ${action}` }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("[logistics-maps]", message);
    return json({ error: message }, 400);
  }
});
