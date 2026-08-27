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

/** Procura um produto no ERP pelo código interno. */
async function findProductByCode(headers: Record<string, string>, code: string) {
  const url = new URL('https://api.gestaoclick.com/api/produtos');
  url.searchParams.set('codigo', code);
  url.searchParams.set('pagina', '1');
  const resp = await fetchWithRetry(url.toString(), { method: 'GET', headers });
  if (!resp.ok) return null;
  const data = await resp.json();
  const list: any[] = data?.data || [];
  const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();
  return (
    list.find((p) => norm(p.codigo_interno) === norm(code) || norm(p.codigo) === norm(code)) || null
  );
}

async function renameProduct(headers: Record<string, string>, productId: string, newCode: string, newName: string) {
  const url = `https://api.gestaoclick.com/api/produtos/${productId}`;
  const resp = await fetchWithRetry(url, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ nome: newName, codigo_interno: newCode }),
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
    const items: { oldCode: string; newCode: string; newName: string }[] = Array.isArray(body.items) ? body.items : [];
    const dryRun: boolean = body.dryRun !== false;

    if (items.length === 0) throw new Error('items é obrigatório');

    const results: any[] = [];
    let updated = 0, notFound = 0, failed = 0, skipped = 0;

    for (const it of items) {
      const oldCode = String(it.oldCode || '').trim();
      const newCode = String(it.newCode || '').trim();
      const newName = String(it.newName || '').trim();
      if (!oldCode || !newCode || !newName) { skipped++; continue; }

      // Se já estiver com o código novo, nada a fazer.
      let product = await findProductByCode(headers, oldCode);
      if (!product) {
        const already = await findProductByCode(headers, newCode);
        if (already) {
          skipped++;
          results.push({ oldCode, newCode, status: 'já atualizado', erp_id: already.id });
          continue;
        }
        notFound++;
        results.push({ oldCode, newCode, status: 'não encontrado no ERP' });
        continue;
      }

      if (dryRun) {
        results.push({ oldCode, newCode, newName, erp_id: product.id, nome_atual: product.nome, status: 'dry-run' });
        continue;
      }

      const res = await renameProduct(headers, String(product.id), newCode, newName);
      if (res.ok) {
        updated++;
        results.push({ oldCode, newCode, erp_id: product.id, status: 'atualizado' });
      } else {
        failed++;
        results.push({ oldCode, newCode, erp_id: product.id, status: 'erro', http: res.status, body: res.body });
      }
      await new Promise((r) => setTimeout(r, 150));
    }

    return new Response(JSON.stringify({ success: true, dry_run: dryRun, total: items.length, updated, not_found: notFound, failed, skipped, results }), {
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
