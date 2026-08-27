import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function getApiHeaders() {
  const accessToken = Deno.env.get('GESTAOCLICK_ACCESS_TOKEN');
  const secretToken = Deno.env.get('GESTAOCLICK_SECRET_ACCESS_TOKEN');
  if (!accessToken) throw new Error('GESTAOCLICK_ACCESS_TOKEN não configurado');
  if (!secretToken) throw new Error('GESTAOCLICK_SECRET_ACCESS_TOKEN não configurado');
  return {
    'access-token': accessToken,
    'secret-access-token': secretToken,
    'Content-Type': 'application/json',
  };
}

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fetch(url, options);
    } catch (error) {
      if (attempt === maxRetries) throw error;
      await new Promise((r) => setTimeout(r, attempt * 1500));
    }
  }
  throw new Error('All retries exhausted');
}

async function findProductByCode(headers: Record<string, string>, code: string) {
  const url = new URL('https://api.gestaoclick.com/api/produtos');
  url.searchParams.set('codigo', code);
  url.searchParams.set('pagina', '1');
  const resp = await fetchWithRetry(url.toString(), { method: 'GET', headers });
  if (!resp.ok) return null;
  const data = await resp.json();
  const list: any[] = data?.data || [];
  const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();
  return list.find((p) => norm(p.codigo_interno) === norm(code) || norm(p.codigo) === norm(code)) || null;
}

async function createProduct(headers: Record<string, string>, code: string, name: string, groupName?: string) {
  const body: Record<string, unknown> = {
    nome: name,
    codigo_interno: code,
    tipo: 'P',
    movimenta_estoque: 1,
    ativo: 1,
  };
  if (groupName) body.nome_grupo = groupName;

  const resp = await fetchWithRetry('https://api.gestaoclick.com/api/produtos', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { ok: resp.ok && json?.code !== 400, status: resp.status, body: json };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  {
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims, error } = await authClient.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (error || !claims?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  }

  try {
    const headers = getApiHeaders();
    const body = await req.json().catch(() => ({}));
    const items: { code: string; name: string; group?: string }[] = Array.isArray(body.items) ? body.items : [];
    const dryRun: boolean = body.dryRun !== false;
    if (items.length === 0) throw new Error('items é obrigatório');

    const results: any[] = [];
    let created = 0, skipped = 0, failed = 0;

    for (const it of items) {
      const code = String(it.code || '').trim();
      const name = String(it.name || '').trim();
      if (!code || !name) { skipped++; continue; }

      const existing = await findProductByCode(headers, code);
      if (existing) {
        skipped++;
        results.push({ code, status: 'já existe', erp_id: existing.id });
        continue;
      }
      if (dryRun) {
        results.push({ code, name, status: 'dry-run' });
        continue;
      }
      const res = await createProduct(headers, code, name, it.group);
      if (res.ok) {
        created++;
        results.push({ code, status: 'criado', erp_id: res.body?.data?.id ?? null });
      } else {
        failed++;
        results.push({ code, status: 'erro', http: res.status, body: res.body });
      }
      await new Promise((r) => setTimeout(r, 150));
    }

    return new Response(JSON.stringify({ success: true, dry_run: dryRun, total: items.length, created, skipped, failed, results }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
