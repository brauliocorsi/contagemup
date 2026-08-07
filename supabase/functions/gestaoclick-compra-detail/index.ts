import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fetch(url, options);
    } catch (error) {
      console.error(`Attempt ${attempt}/${maxRetries} failed:`, error);
      if (attempt === maxRetries) throw error;
      await new Promise(r => setTimeout(r, attempt * 1500));
    }
  }
  throw new Error('All retries exhausted');
}

async function fetchPage(baseUrl: string, page: number, headers: Record<string, string>): Promise<{ data: unknown[]; meta: Record<string, unknown> }> {
  const url = new URL(baseUrl);
  url.searchParams.set('pagina', String(page));
  const response = await fetchWithRetry(url.toString(), { method: 'GET', headers });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GestãoClick API error [${response.status}]: ${errorText}`);
  }
  const data = await response.json();
  return { data: data?.data || [], meta: data?.meta || {} };
}

function normalizeCode(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeIdentifier(value: unknown): string {
  return String(value ?? '').trim();
}

function stripLeadingZeros(v: string): string {
  return v.replace(/^0+/, '') || v;
}

function numeroMatches(input: string, candidate: unknown): boolean {
  const a = normalizeIdentifier(input);
  const b = normalizeIdentifier(candidate);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.toLowerCase() === b.toLowerCase()) return true;
  return stripLeadingZeros(a) === stripLeadingZeros(b);
}

// GestãoClick often wraps rows: { Compra: {...} } / { compra: {...} }.
// deno-lint-ignore no-explicit-any
function unwrapCompra(row: any): any {
  if (!row || typeof row !== 'object') return row;
  for (const key of ['Compra', 'compra']) {
    if (key in row && row[key] && typeof row[key] === 'object') return row[key];
  }
  return row;
}

// deno-lint-ignore no-explicit-any
function extractProductReferences(item: any): { productCode: string; productId: string; variationId: string } {
  const product = item?.produto || {};
  const productCodeCandidates = [
    item?.codigo_interno, item?.codigo, item?.produto_codigo, item?.produto_codigo_interno,
    item?.variacao_codigo, item?.variacao?.codigo,
    product?.codigo_interno, product?.codigo, product?.produto_codigo, product?.codigo_produto,
    product?.variacao_codigo, product?.referencia,
  ];
  const productIdCandidates = [item?.produto_id, item?.product_id, product?.produto_id, product?.id];
  const variationIdCandidates = [item?.variacao_id, item?.variation_id, item?.variacao?.id, product?.variacao_id, product?.variacao?.id];
  const productCode = normalizeCode(productCodeCandidates.find(v => String(v ?? '').trim() !== ''));
  const productId = normalizeIdentifier(productIdCandidates.find(v => String(v ?? '').trim() !== ''));
  const variationId = normalizeIdentifier(variationIdCandidates.find(v => String(v ?? '').trim() !== ''));
  return { productCode, productId, variationId };
}

// deno-lint-ignore no-explicit-any
function extractCompraHeader(compra: any) {
  const fornecedor =
    compra?.fornecedor?.nome ||
    compra?.fornecedor?.razao_social ||
    compra?.nome_fornecedor ||
    compra?.fornecedor_nome ||
    (typeof compra?.fornecedor === 'string' ? compra.fornecedor : '') ||
    '';
  const situacao =
    compra?.situacao?.nome ||
    compra?.situacao_nome ||
    compra?.status ||
    (typeof compra?.situacao === 'string' ? compra.situacao : '') ||
    '';
  const data =
    compra?.data ||
    compra?.data_compra ||
    compra?.data_emissao ||
    compra?.data_criacao ||
    compra?.created_at ||
    '';
  const valorTotal =
    compra?.valor_total ??
    compra?.total ??
    compra?.valor ??
    null;
  const numero =
    compra?.codigo ||
    compra?.numero ||
    compra?.numero_documento ||
    String(compra?.id ?? '');
  return {
    id: String(compra?.id ?? ''),
    numero: String(numero ?? ''),
    data: String(data ?? ''),
    fornecedor_nome: String(fornecedor ?? ''),
    situacao: String(situacao ?? ''),
    valor_total: valorTotal !== null && valorTotal !== undefined ? Number(valorTotal) : null,
  };
}

function normalizeName(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

interface NormalizedItem {
  codigo: string;
  nome: string;
  quantidade: number;
  valor_unitario: number | null;
  produto_id_gc: string;
  variacao_id_gc: string;
}


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // --- Auth ---
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  {
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: claims, error: claimsErr } = await authClient.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (claimsErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }
  // --- /Auth ---

  try {
    const accessToken = Deno.env.get('GESTAOCLICK_ACCESS_TOKEN');
    const secretToken = Deno.env.get('GESTAOCLICK_SECRET_ACCESS_TOKEN');
    if (!accessToken) throw new Error('GESTAOCLICK_ACCESS_TOKEN não configurado');
    if (!secretToken) throw new Error('GESTAOCLICK_SECRET_ACCESS_TOKEN não configurado');

    const body = await req.json().catch(() => ({}));
    const numero = String(body?.numero ?? '').trim();
    if (!numero) {
      return new Response(JSON.stringify({ error: 'Parâmetro "numero" é obrigatório' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiHeaders = {
      'access-token': accessToken,
      'secret-access-token': secretToken,
      'Content-Type': 'application/json',
    };

    // Try to resolve compra by scanning /api/compras pages until we find a match on codigo/numero/id.
    // Some GestãoClick accounts support ?codigo=... — try that first for speed.
    const baseListUrl = 'https://api.gestaoclick.com/api/compras';

    // deno-lint-ignore no-explicit-any
    let foundCompra: any = null;

    const matchesNumero = (c: unknown) =>
      numeroMatches(numero, (c as { codigo?: unknown }).codigo) ||
      numeroMatches(numero, (c as { numero?: unknown }).numero) ||
      numeroMatches(numero, (c as { numero_documento?: unknown }).numero_documento) ||
      numeroMatches(numero, (c as { id?: unknown }).id);

    // 0) If numero is purely numeric, try direct fetch by ID.
    if (/^\d+$/.test(numero)) {
      try {
        const r = await fetchWithRetry(`${baseListUrl}/${numero}`, { method: 'GET', headers: apiHeaders });
        if (r.ok) {
          const j = await r.json();
          const raw = j?.data ?? j;
          const d = unwrapCompra(Array.isArray(raw) ? raw[0] : raw);
          if (d && (d.id || d.codigo || d.numero)) foundCompra = d;
        } else {
          await r.text();
        }
      } catch (_e) { /* ignore */ }
    }

    // 1) Fast path: try common filter params. If the API returns exactly 1 row
    //    for a filter it recognizes, trust it (the filter already scoped it).
    if (!foundCompra) {
      for (const paramName of ['codigo', 'numero', 'numero_documento']) {
        try {
          const fastUrl = new URL(baseListUrl);
          fastUrl.searchParams.set(paramName, numero);
          const res = await fetchWithRetry(fastUrl.toString(), { method: 'GET', headers: apiHeaders });
          if (!res.ok) { await res.text(); continue; }
          const j = await res.json();
          const arr = (j?.data || []) as unknown[];
          const totalRegistros = Number(j?.meta?.total_registros ?? arr.length);
          console.log(`[compra-detail] filter ${paramName}=${numero} -> ${arr.length} rows (total=${totalRegistros})`);
          if (arr.length === 1 && totalRegistros === 1) {
            foundCompra = unwrapCompra(arr[0]);
            console.log(`[compra-detail] single-hit id=${foundCompra?.id} codigo=${foundCompra?.codigo}`);
            break;
          }
          for (const c of arr) {
            const u = unwrapCompra(c);
            if (matchesNumero(u)) { foundCompra = u; break; }
          }
          if (foundCompra) break;
        } catch (_e) { /* try next */ }
      }
    }

    // 2) Fallback: paginated scan (cap for safety)
    if (!foundCompra) {
      const first = await fetchPage(baseListUrl, 1, apiHeaders);
      const totalPages = Math.min(Number(first.meta?.total_paginas ?? 1), 100);
      console.log(`[compra-detail] scanning ${totalPages} pages of /api/compras for "${numero}"`);
      const scan = (arr: unknown[]) => {
        for (const c of arr) {
          const u = unwrapCompra(c);
          if (matchesNumero(u)) { foundCompra = u; return true; }
        }
        return false;
      };
      if (!scan(first.data)) {
        for (let p = 2; p <= totalPages && !foundCompra; p += 5) {
          const batch: number[] = [];
          for (let i = p; i < p + 5 && i <= totalPages; i++) batch.push(i);
          const results = await Promise.all(batch.map(pg => fetchPage(baseListUrl, pg, apiHeaders)));
          for (const r of results) {
            if (scan(r.data)) break;
          }
          if (!foundCompra && p + 5 <= totalPages) await new Promise(r => setTimeout(r, 120));
        }
      }
    }

    if (!foundCompra) {
      console.log(`[compra-detail] not found: ${numero}`);
      return new Response(JSON.stringify({ error: 'Compra não encontrada no Gestão Click' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch full detail
    const compraId = String(foundCompra?.id ?? '');
    // deno-lint-ignore no-explicit-any
    let detail: any = foundCompra;
    if (compraId) {
      try {
        const detRes = await fetchWithRetry(`https://api.gestaoclick.com/api/compras/${compraId}`, {
          method: 'GET', headers: apiHeaders,
        });
        if (detRes.ok) {
          const j = await detRes.json();
          const raw = j?.data ?? j ?? foundCompra;
          detail = unwrapCompra(Array.isArray(raw) ? raw[0] : raw);
          console.log(`[compra-detail] detail keys: ${Object.keys(detail || {}).join(',')}`);
        } else {
          await detRes.text();
        }
      } catch (_e) { /* keep list-level data */ }
    }

    const header = extractCompraHeader(detail);

    const rawItems: unknown[] =
      (detail?.produtos as unknown[]) ||
      (detail?.itens as unknown[]) ||
      (detail?.items as unknown[]) ||
      [];

    // Collect refs needing product lookup
    const requiredProductIds = new Set<string>();
    const requiredVariationIds = new Set<string>();
    for (const it of rawItems) {
      const refs = extractProductReferences(it);
      if (!refs.productCode) {
        if (refs.productId) requiredProductIds.add(refs.productId);
        if (refs.variationId) requiredVariationIds.add(refs.variationId);
      }
    }

    const productCodeByProductId: Record<string, string> = {};
    const productCodeByVariationId: Record<string, string> = {};

    if (requiredProductIds.size > 0 || requiredVariationIds.size > 0) {
      const productsBaseUrl = 'https://api.gestaoclick.com/api/produtos?ativo=1';
      const firstProductsPage = await fetchPage(productsBaseUrl, 1, apiHeaders);
      const totalProductPages = Math.min(Number(firstProductsPage.meta?.total_paginas ?? 1), 30);
      const pendingProductIds = new Set(requiredProductIds);
      const pendingVariationIds = new Set(requiredVariationIds);

      // deno-lint-ignore no-explicit-any
      const consumeProducts = (products: any[]) => {
        for (const product of products) {
          const pid = normalizeIdentifier(product?.id);
          const code = normalizeCode(product?.codigo_interno || product?.codigo);
          if (pid && code) { productCodeByProductId[pid] = code; pendingProductIds.delete(pid); }
          const variacoes = Array.isArray(product?.variacoes) ? product.variacoes : [];
          for (const vw of variacoes) {
            const v = vw?.variacao || vw || {};
            const vid = normalizeIdentifier(v?.id || v?.variacao_id);
            const vc = normalizeCode(v?.codigo || v?.codigo_interno || code);
            if (vid && vc) { productCodeByVariationId[vid] = vc; pendingVariationIds.delete(vid); }
          }
        }
      };

      consumeProducts(firstProductsPage.data);
      for (let bs = 2; bs <= totalProductPages && (pendingProductIds.size > 0 || pendingVariationIds.size > 0); bs += 5) {
        const be = Math.min(bs + 4, totalProductPages);
        const pgs: number[] = [];
        for (let p = bs; p <= be; p++) pgs.push(p);
        const res = await Promise.all(pgs.map(p => fetchPage(productsBaseUrl, p, apiHeaders)));
        for (const r of res) consumeProducts(r.data);
        if (be < totalProductPages) await new Promise(r => setTimeout(r, 150));
      }
    }

    const itens: NormalizedItem[] = rawItems.map((it) => {
      const refs = extractProductReferences(it);
      const codigo =
        refs.productCode ||
        (refs.variationId ? productCodeByVariationId[refs.variationId] : '') ||
        (refs.productId ? productCodeByProductId[refs.productId] : '') ||
        '';
      // deno-lint-ignore no-explicit-any
      const anyIt = it as any;
      const nome =
        anyIt?.nome ||
        anyIt?.produto_nome ||
        anyIt?.produto?.nome ||
        anyIt?.produto?.nome_produto ||
        anyIt?.descricao ||
        anyIt?.produto?.descricao ||
        '';
      const quantidade = Number(anyIt?.quantidade ?? anyIt?.produto?.quantidade ?? 0) || 0;
      const valorUnit = Number(
        anyIt?.valor_unitario ??
        anyIt?.valor ??
        anyIt?.preco ??
        anyIt?.produto?.valor_unitario ??
        NaN
      );
      return {
        codigo,
        nome: String(nome || ''),
        quantidade,
        valor_unitario: Number.isFinite(valorUnit) ? valorUnit : null,
        produto_id_gc: refs.productId,
        variacao_id_gc: refs.variationId,
      };
    });

    return new Response(JSON.stringify({ compra: header, itens }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('gestaoclick-compra-detail error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
