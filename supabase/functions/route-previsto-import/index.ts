// Importa o "previsto" (valores a cobrar) das notas de uma instância rota/data
// a partir da Gestão Click. Só lê da Gestão Click: nunca escreve vendas,
// recebimentos ou stock no ERP. As credenciais ficam apenas no servidor.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const API = 'https://api.gestaoclick.com';
type Dict = Record<string, unknown>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
}

/** Converte "1.234,56" / "1234.56" em cêntimos exactos, sem vírgula flutuante. */
function toCents(raw: unknown): number | null {
  const s = str(raw).replace(/[^\d,.-]/g, '');
  if (!s) return null;
  const normalized =
    s.includes(',') && s.lastIndexOf(',') > s.lastIndexOf('.')
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '');
  const m = normalized.match(/^(-?)(\d+)(?:\.(\d{0,6}))?$/);
  if (!m) return null;
  const dec = (m[3] ?? '').padEnd(2, '0').slice(0, 2);
  const cents = Number(m[2]) * 100 + Number(dec || '0');
  return m[1] === '-' ? -cents : cents;
}

function norm(v: string) {
  return v
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function unwrap(list: unknown, key: string): Dict[] {
  return (Array.isArray(list) ? list : [])
    .map((e) => (e as Record<string, Dict | undefined>)[key] ?? (e as Dict))
    .filter((e) => e && Object.keys(e).length > 0);
}

function gcHeaders() {
  const accessToken = Deno.env.get('GESTAOCLICK_ACCESS_TOKEN');
  const secretToken = Deno.env.get('GESTAOCLICK_SECRET_ACCESS_TOKEN');
  if (!accessToken || !secretToken) throw new Error('Credenciais da Gestão Click em falta');
  return {
    'access-token': accessToken,
    'secret-access-token': secretToken,
    Accept: 'application/json',
  };
}

async function gcGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: gcHeaders() });
  if (!res.ok) throw new Error(`Gestão Click respondeu ${res.status}`);
  return (await res.json()) as T;
}

/** Resolve o ID estável da venda a partir do número de encomenda visível. */
async function findSaleId(codigo: string): Promise<string | null> {
  for (let page = 1; page <= 50; page++) {
    const res = await gcGet<{ meta?: { total_paginas?: number }; data?: Dict[] }>(
      `/vendas?limite=100&pagina=${page}`,
    );
    const rows = Array.isArray(res.data) ? res.data : [];
    if (rows.length === 0) return null;
    for (const v of rows) {
      if (str(v['codigo']) === codigo.trim()) return str(v['id']);
    }
    const total = Math.max(1, Number(res.meta?.total_paginas ?? 1));
    if (page >= total) return null;
  }
  return null;
}

const PAID_STATUS = /(pago|recebido|liquidad|baixad|quitad|confirmad)/;
const OPEN_STATUS = /(pendente|aberto|em aberto|a receber|nao pago|não pago|vencid)/;

type MethodCfg = {
  id: string;
  label: string;
  collect_on_delivery: boolean;
  gc_identifiers: string[];
  gc_name_patterns: string[];
  active: boolean;
};

type Parcel = {
  parcel_key: string;
  method_raw_id: string | null;
  method_raw_name: string | null;
  method_id: string | null;
  classification: 'collect_on_delivery' | 'already_paid' | 'unknown';
  amount_cents: number;
  due_date: string | null;
  gc_status: string | null;
  exception_note: string | null;
  snapshot: Dict;
};

function classify(p: Dict, idx: number, methods: MethodCfg[]): Parcel {
  const rawName =
    str(p['nome_forma_pagamento']) || str(p['forma_pagamento']) || str(p['nome']) || '';
  const rawId = str(p['forma_pagamento_id']) || str(p['id_forma_pagamento']) || '';
  const status = str(p['situacao']) || str(p['status']) || str(p['nome_situacao']) || '';
  const cents = toCents(p['valor'] ?? p['valor_pago'] ?? p['valor_total']);
  const key =
    str(p['id']) || str(p['parcela']) || `${rawName || 'parcela'}#${idx + 1}`;

  const base = {
    parcel_key: key,
    method_raw_id: rawId || null,
    method_raw_name: rawName || null,
    due_date: /^\d{4}-\d{2}-\d{2}/.test(str(p['data_vencimento']))
      ? str(p['data_vencimento']).slice(0, 10)
      : null,
    gc_status: status || null,
    snapshot: p,
  };

  if (cents === null || cents < 0) {
    return {
      ...base,
      method_id: null,
      classification: 'unknown',
      amount_cents: 0,
      exception_note: 'Valor da parcela ausente ou inválido na resposta da Gestão Click',
    };
  }

  const byId = rawId
    ? methods.find((m) => m.gc_identifiers.map(norm).includes(norm(rawId)))
    : undefined;
  const byName = rawName
    ? methods.find((m) => m.gc_name_patterns.some((pat) => norm(rawName).includes(norm(pat))))
    : undefined;
  const method = byId ?? byName;

  if (!method) {
    return {
      ...base,
      method_id: null,
      classification: 'unknown',
      amount_cents: cents,
      exception_note: rawName
        ? `Forma "${rawName}" não está configurada — por rever`
        : 'Forma de pagamento não indicada pela Gestão Click',
    };
  }

  const st = norm(status);
  const looksPaid = st ? PAID_STATUS.test(st) : false;
  const looksOpen = st ? OPEN_STATUS.test(st) : false;

  // Contradição entre a regra operacional e o estado explícito da API -> revisão.
  if (method.collect_on_delivery && looksPaid) {
    return {
      ...base,
      method_id: method.id,
      classification: 'unknown',
      amount_cents: cents,
      exception_note: `A Gestão Click indica "${status}" numa parcela a cobrar na entrega — confirme antes de cobrar`,
    };
  }
  if (!method.collect_on_delivery && looksOpen) {
    return {
      ...base,
      method_id: method.id,
      classification: 'unknown',
      amount_cents: cents,
      exception_note: `A Gestão Click indica "${status}" numa parcela dada como já paga — por rever`,
    };
  }

  return {
    ...base,
    method_id: method.id,
    classification: method.collect_on_delivery ? 'collect_on_delivery' : 'already_paid',
    amount_cents: cents,
    exception_note: null,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'Sessão não encontrada: inicie sessão novamente.' }, 401);
  }

  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // validar o token diretamente no serviço de autenticação
  const token = authHeader.slice('Bearer '.length).trim();
  const userRes = await fetch(`${url}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    },
  });
  if (!userRes.ok) {
    console.log('previsto-auth', { status: userRes.status });
    return json({ error: 'Sessão expirada: termine sessão e volte a entrar.' }, 401);
  }
  const uid = ((await userRes.json()) as { id?: string }).id;
  if (!uid) return json({ error: 'Sessão expirada: termine sessão e volte a entrar.' }, 401);





  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('user_id', uid)
    .maybeSingle();
  if (!profile || !['master', 'admin', 'operator', 'financeiro'].includes(profile.role)) {

    return json({ error: 'Sem permissão para importar o previsto' }, 403);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const routeId: string = body.route_id;
    const opKey: string = body.op_key ?? crypto.randomUUID();
    const onlyNotes: string[] | null = Array.isArray(body.note_ids) ? body.note_ids : null;
    if (!routeId) return json({ error: 'route_id é obrigatório' }, 400);

    const { data: route } = await admin
      .from('route_schedules')
      .select('id, composition_version')
      .eq('id', routeId)
      .maybeSingle();
    if (!route) return json({ error: 'Rota não encontrada' }, 404);

    // Idempotência: a mesma chave devolve o resultado anterior.
    const { data: existing } = await admin
      .from('route_previsto_imports')
      .select('*')
      .eq('op_key', opKey)
      .maybeSingle();
    if (existing) return json({ import: existing, idempotent: true });

    // Alvos do previsto: as encomendas da rota. A ligação real está nas
    // paragens (route_stops); a nota de separação pode ainda não existir.
    const { data: stops, error: stopsErr } = await admin
      .from('route_stops')
      .select('id, venda_codigo, venda_id, order_number')
      .eq('route_id', routeId)
      .order('order_number', { ascending: true });
    if (stopsErr) throw stopsErr;

    const stopCodes = (stops ?? [])
      .map((s: { venda_codigo: string | null }) => String(s.venda_codigo ?? '').trim())
      .filter((c: string) => c.length > 0);

    const orFilters = [`route_id.eq.${routeId}`];
    if (stopCodes.length > 0) {
      orFilters.push(`order_number.in.(${stopCodes.map((c) => `"${c.replace(/"/g, '\\"')}"`).join(',')})`);
    }

    const { data: notes, error: notesErr } = await admin
      .from('delivery_notes')
      .select('id, order_number, created_at')
      .or(orFilters.join(','))
      .order('created_at', { ascending: true });
    if (notesErr) throw notesErr;

    const noteByCode = new Map<string, string>();
    for (const n of notes ?? []) {
      const c = String(n.order_number ?? '').trim();
      if (c && !noteByCode.has(c)) noteByCode.set(c, n.id as string);
    }

    type Target = { note_id: string | null; code: string; sale_id: string | null };
    const targets: Target[] = [];
    const added = new Set<string>();
    for (const s of stops ?? []) {
      const code = String((s as Dict)['venda_codigo'] ?? '').trim();
      if (!code || added.has(code)) continue;
      added.add(code);
      targets.push({
        note_id: noteByCode.get(code) ?? null,
        code,
        sale_id: str((s as Dict)['venda_id']) || null,
      });
    }
    // notas ligadas à rota sem paragem correspondente
    for (const n of notes ?? []) {
      const code = String(n.order_number ?? '').trim();
      if (!code || added.has(code)) continue;
      added.add(code);
      targets.push({ note_id: n.id as string, code, sale_id: null });
    }

    const scoped = onlyNotes
      ? targets.filter((t) => (t.note_id && onlyNotes.includes(t.note_id)) || onlyNotes.includes(t.code))
      : targets;

    const { data: methodsRaw } = await admin
      .from('payment_methods')
      .select('*')
      .eq('active', true);
    const methods = (methodsRaw ?? []) as MethodCfg[];

    const { data: run, error: runErr } = await admin
      .from('route_previsto_imports')
      .insert({
        route_id: routeId,
        composition_version: route.composition_version,
        status: 'running',
        op_key: opKey,
        requested_by: uid,
        notes_total: scoped.length,
      })

      .select()
      .single();
    if (runErr) throw runErr;

    const failures: { note_id: string; order_number: string; reason: string }[] = [];
    let ok = 0;

    for (const target of scoped) {
      const code = target.code;
      try {
        const saleId = target.sale_id ?? (await findSaleId(code));
        if (!saleId) throw new Error('Venda não encontrada na Gestão Click');

        const detail = await gcGet<{ data?: Dict }>(`/vendas/${saleId}`);
        const venda = detail.data ?? {};
        const rawParcels = unwrap(venda['pagamentos'], 'pagamento');
        const fetchedAt = new Date().toISOString();

        const parcels = rawParcels.map((p, i) => classify(p, i, methods));
        if (parcels.length === 0) {
          parcels.push({
            parcel_key: 'sem-parcelas',
            method_raw_id: null,
            method_raw_name: null,
            method_id: null,
            classification: 'unknown',
            amount_cents: toCents(venda['valor_total']) ?? 0,
            due_date: null,
            gc_status: str(venda['nome_situacao']) || null,
            exception_note:
              'A venda não devolveu parcelas de pagamento — confirme o valor a cobrar antes da entrega',
            snapshot: venda,
          });
        }

        // revisão seguinte desta encomenda nesta rota
        const { data: prev } = await admin
          .from('delivery_note_payables')
          .select('revision')
          .eq('route_id', routeId)
          .eq('gc_sale_code', code)
          .order('revision', { ascending: false })
          .limit(1);
        const revision = (prev?.[0]?.revision ?? 0) + 1;

        // a revisão anterior deixa de estar activa
        await admin
          .from('delivery_note_payables')
          .update({ active: false })
          .eq('route_id', routeId)
          .eq('gc_sale_code', code)
          .eq('active', true);

        const rows = parcels.map((p) => ({
          note_id: target.note_id,
          route_id: routeId,
          import_id: run.id,
          revision,
          parcel_key: p.parcel_key,
          gc_sale_id: saleId,
          gc_sale_code: code,
          gc_store: str(venda['nome_loja']) || null,
          method_raw_id: p.method_raw_id,
          method_raw_name: p.method_raw_name,
          method_id: p.method_id,
          classification: p.classification,
          amount_cents: p.amount_cents,
          due_date: p.due_date,
          gc_status: p.gc_status,
          snapshot: p.snapshot,
          source_url: `${API}/vendas/${saleId}`,
          fetched_at: fetchedAt,
          exception_note: p.exception_note,
          imported_by: uid,
        }));

        const { error: insErr } = await admin.from('delivery_note_payables').insert(rows);
        if (insErr) throw insErr;

        ok++;
      } catch (e) {
        failures.push({
          note_id: target.note_id ?? code,
          order_number: code,
          reason: e instanceof Error ? e.message : 'Falha desconhecida',

        });
      }
    }

    const status = failures.length === 0 ? 'completed' : ok > 0 ? 'partial' : 'failed';
    const { data: finished } = await admin
      .from('route_previsto_imports')
      .update({
        status,
        notes_ok: ok,
        notes_failed: failures.length,
        failures,
      })
      .eq('id', run.id)
      .select()
      .single();

    return json({ import: finished, failures });
  } catch (error) {
    console.error('route-previsto-import', error);
    return json({ error: error instanceof Error ? error.message : 'Erro desconhecido' }, 500);
  }
});
