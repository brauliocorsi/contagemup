import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (error) {
      console.error(`Attempt ${attempt}/${maxRetries} failed:`, error);
      if (attempt === maxRetries) throw error;
      await new Promise(resolve => setTimeout(resolve, attempt * 2000));
    }
  }
  throw new Error('All retries exhausted');
}

async function fetchPage(baseUrl: string, page: number, headers: Record<string, string>): Promise<{ data: any[]; meta: any }> {
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

function normalizeDateStr(dateStr: string): string {
  if (!dateStr) return '';
  if (dateStr.includes('/')) {
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  return dateStr.substring(0, 10);
}

function isDateInRange(dateStr: string, dateFrom: string, dateTo: string): boolean {
  const normalized = normalizeDateStr(dateStr);
  if (!normalized) return false;
  if (dateFrom && normalized < dateFrom) return false;
  if (dateTo && normalized > dateTo) return false;
  return true;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // --- Auth (Fase 2): valida JWT em código ---
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  {
    const _authClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: _claims, error: _claimsErr } = await _authClient.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (_claimsErr || !_claims?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  }
  // --- /Auth ---


  try {
    const accessToken = Deno.env.get('GESTAOCLICK_ACCESS_TOKEN');
    const secretToken = Deno.env.get('GESTAOCLICK_SECRET_ACCESS_TOKEN');
    if (!accessToken) throw new Error('GESTAOCLICK_ACCESS_TOKEN não configurado');
    if (!secretToken) throw new Error('GESTAOCLICK_SECRET_ACCESS_TOKEN não configurado');

    const body = await req.json();
    // Support both single date and date range
    const dateFrom = body?.dateFrom || body?.date;
    const dateTo = body?.dateTo || body?.date;
    const selectedStatuses: string[] | undefined = body?.statuses; // optional array of status names

    if (!dateFrom) {
      throw new Error('Parâmetro "dateFrom" ou "date" é obrigatório (formato YYYY-MM-DD)');
    }

    const apiHeaders = {
      'access-token': accessToken,
      'secret-access-token': secretToken,
      'Content-Type': 'application/json',
    };

    // Step 1: Fetch situacoes_vendas
    const situacoesRes = await fetchWithRetry('https://api.gestaoclick.com/api/situacoes_vendas', {
      method: 'GET', headers: apiHeaders,
    });
    if (!situacoesRes.ok) throw new Error(`Failed to fetch situacoes_vendas: ${situacoesRes.status}`);
    const situacoesData = await situacoesRes.json();
    const situacoes = situacoesData?.data || [];

    // Build lookup and filter by selected statuses (or default)
    const DEFAULT_STATUSES = ['agendado entrega', 'agendado levantamento'];
    const filterStatuses = (selectedStatuses && selectedStatuses.length > 0)
      ? selectedStatuses.map(s => s.toLowerCase().trim())
      : DEFAULT_STATUSES;

    const includedIds = new Set<string>();
    const situacaoLookup: Record<string, string> = {};
    const allSituacoes: Array<{ id: string; nome: string }> = [];

    for (const sit of situacoes) {
      const name = (sit.nome || '').toLowerCase().trim();
      situacaoLookup[String(sit.id)] = sit.nome;
      allSituacoes.push({ id: String(sit.id), nome: sit.nome || '' });
      if (filterStatuses.some(inc => name.includes(inc))) {
        includedIds.add(String(sit.id));
      }
    }

    console.log('Included status IDs:', [...includedIds], 'Filter statuses:', filterStatuses);

    // Step 2: Fetch vendas (filtered server-side por situação) e filtrar por data
    const startedAt = Date.now();
    const DEADLINE_MS = 100_000; // margem face ao idle timeout de 150s
    const timeLeft = () => DEADLINE_MS - (Date.now() - startedAt);

    const matchingVendas: any[] = [];
    let truncated = false;

    const processVendas = (vendas: any[]) => {
      for (const venda of vendas) {
        if (!includedIds.has(String(venda.situacao_id))) continue;

        const deliveryDate = venda.prazo_entrega || venda.data_entrega || venda.data_previsao || '';
        const vendaDate = venda.data || '';

        const deliveryInRange = deliveryDate ? isDateInRange(deliveryDate, dateFrom, dateTo) : false;
        const vendaInRange = vendaDate ? isDateInRange(vendaDate, dateFrom, dateTo) : false;

        if (deliveryInRange || vendaInRange) {
          matchingVendas.push(venda);
        }
      }
    };

    const BATCH_SIZE = 10;

    const scanVendasUrl = async (baseUrl: string) => {
      const first = await fetchPage(baseUrl, 1, apiHeaders);
      processVendas(first.data);
      const totalPages = first.meta.total_paginas || 1;

      for (let batchStart = 2; batchStart <= totalPages; batchStart += BATCH_SIZE) {
        if (timeLeft() <= 0) { truncated = true; return; }
        const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, totalPages);
        const pages: number[] = [];
        for (let p = batchStart; p <= batchEnd; p++) pages.push(p);
        const results = await Promise.all(pages.map(p => fetchPage(baseUrl, p, apiHeaders)));
        for (const result of results) processVendas(result.data);
      }
    };

    if (includedIds.size > 0) {
      // Uma varredura por situação: reduz drasticamente o nº de páginas
      for (const sid of includedIds) {
        if (timeLeft() <= 0) { truncated = true; break; }
        await scanVendasUrl(`https://api.gestaoclick.com/api/vendas?situacao_id=${encodeURIComponent(sid)}`);
      }
      // Fallback: se o filtro do servidor não devolveu nada, varre tudo
      if (matchingVendas.length === 0 && !truncated) {
        await scanVendasUrl('https://api.gestaoclick.com/api/vendas');
      }
    } else {
      await scanVendasUrl('https://api.gestaoclick.com/api/vendas');
    }


    // Step 3: Resolve product codes if needed
    const requiredProductIds = new Set<string>();
    const requiredVariationIds = new Set<string>();

    for (const venda of matchingVendas) {
      const items = venda.produtos || venda.itens || [];
      for (const item of items) {
        const refs = extractProductReferences(item);
        if (!refs.productCode) {
          if (refs.productId) requiredProductIds.add(refs.productId);
          if (refs.variationId) requiredVariationIds.add(refs.variationId);
        }
      }
    }

    const productCodeByProductId: Record<string, string> = {};
    const productCodeByVariationId: Record<string, string> = {};

    if (requiredProductIds.size > 0 || requiredVariationIds.size > 0) {
      const productsBaseUrl = 'https://api.gestaoclick.com/api/produtos?ativo=1';
      const firstProductsPage = await fetchPage(productsBaseUrl, 1, apiHeaders);
      const totalProductPages = firstProductsPage.meta.total_paginas || 1;
      const pendingProductIds = new Set(requiredProductIds);
      const pendingVariationIds = new Set(requiredVariationIds);

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
      for (let bs = 2; bs <= totalProductPages && (pendingProductIds.size > 0 || pendingVariationIds.size > 0); bs += 10) {
        if (timeLeft() <= 0) { truncated = true; break; }
        const be = Math.min(bs + 9, totalProductPages);
        const pgs = []; for (let p = bs; p <= be; p++) pgs.push(p);
        const res = await Promise.all(pgs.map(p => fetchPage(productsBaseUrl, p, apiHeaders)));
        for (const r of res) consumeProducts(r.data);
      }

    }

    // Step 4: Build exit items
    const salesExits: Array<{
      venda_id: string;
      codigo: string;
      cliente_nome: string;
      situacao: string;
      data: string;
      prazo_entrega: string;
      items: Array<{ productCode: string; productName: string; quantity: number }>;
    }> = [];

    for (const venda of matchingVendas) {
      const saleItems: Array<{ productCode: string; productName: string; quantity: number }> = [];
      const items = venda.produtos || venda.itens || [];

      for (const item of items) {
        const refs = extractProductReferences(item);
        const resolvedCode = refs.productCode
          || (refs.variationId ? productCodeByVariationId[refs.variationId] : '')
          || (refs.productId ? productCodeByProductId[refs.productId] : '');

        if (!resolvedCode) continue;

        saleItems.push({
          productCode: resolvedCode,
          productName: item.nome || item.produto_nome || item.produto?.nome_produto || '',
          quantity: parseInt(String(item.quantidade || item.produto?.quantidade || '1'), 10) || 1,
        });
      }

      if (saleItems.length > 0) {
        salesExits.push({
          venda_id: String(venda.id),
          codigo: String(venda.codigo || ''),
          cliente_nome: venda.cliente_nome || venda.cliente?.nome || 'N/A',
          situacao: situacaoLookup[String(venda.situacao_id)] || 'Desconhecida',
          data: venda.data || '',
          prazo_entrega: venda.prazo_entrega || venda.data_entrega || venda.data_previsao || '',
          items: saleItems,
        });
      }
    }

    return new Response(JSON.stringify({
      salesExits,
      totalSales: salesExits.length,
      dateFrom,
      dateTo,
      allSituacoes, // Return all available statuses for the UI
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error fetching scheduled exits:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
