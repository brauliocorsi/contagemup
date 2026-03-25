import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const EXCLUDED_STATUSES = ['conferido', 'produto entregue', 'cancelado', 'levantado', 'levantado - conferido', 'produto entregue parcial'];
const CACHE_TTL_MINUTES = 15;
const PAGES_PER_CHUNK = 5;

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
}

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 2): Promise<Response> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (error) {
      if (attempt === maxRetries) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000));
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
    throw new Error(`API error [${response.status}]: ${errorText}`);
  }
  const data = await response.json();
  return { data: data?.data || [], meta: data?.meta || {} };
}

function normalizeCode(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function extractProductCode(item: any): string {
  const product = item?.produto || {};
  const candidates = [
    item?.codigo_interno, item?.codigo, item?.produto_codigo,
    item?.produto_codigo_interno, item?.variacao_codigo, item?.variacao?.codigo,
    product?.codigo_interno, product?.codigo, product?.produto_codigo,
    product?.codigo_produto, product?.variacao_codigo, product?.referencia,
  ];
  return normalizeCode(candidates.find((v) => String(v ?? '').trim() !== ''));
}

async function getCachedSales(supabase: any): Promise<{ salesMap: Record<string, any[]>; totalVendas: number; cachedAt: string } | null> {
  const cutoff = new Date(Date.now() - CACHE_TTL_MINUTES * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('erp_sales_cache')
    .select('product_code, venda_data, fetched_at')
    .gte('fetched_at', cutoff)
    .limit(1);

  if (error || !data || data.length === 0) return null;

  // Fetch all cached rows (may be >1000, paginate)
  let allData: any[] = [];
  let from = 0;
  const batchSize = 1000;
  while (true) {
    const { data: batch, error: batchError } = await supabase
      .from('erp_sales_cache')
      .select('product_code, venda_data, fetched_at')
      .gte('fetched_at', cutoff)
      .range(from, from + batchSize - 1);
    if (batchError || !batch || batch.length === 0) break;
    allData = allData.concat(batch);
    if (batch.length < batchSize) break;
    from += batchSize;
  }

  if (allData.length === 0) return null;

  const salesMap: Record<string, any[]> = {};
  let totalVendas = 0;
  const vendaIds = new Set<string>();

  for (const row of allData) {
    if (!salesMap[row.product_code]) salesMap[row.product_code] = [];
    const venda = row.venda_data;
    salesMap[row.product_code].push(venda);
    if (!vendaIds.has(venda.venda_id)) {
      vendaIds.add(venda.venda_id);
      totalVendas++;
    }
  }

  return { salesMap, totalVendas, cachedAt: allData[0].fetched_at };
}

async function saveToSalesCache(supabase: any, productSalesMap: Record<string, any[]>) {
  await supabase.from('erp_sales_cache').delete().lt('fetched_at', new Date().toISOString());

  const now = new Date().toISOString();
  const rows: any[] = [];

  for (const [code, vendas] of Object.entries(productSalesMap)) {
    for (const venda of vendas) {
      rows.push({ product_code: code, venda_data: venda, fetched_at: now });
    }
  }

  for (let i = 0; i < rows.length; i += 500) {
    await supabase.from('erp_sales_cache').insert(rows.slice(i, i + 500));
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const accessToken = Deno.env.get('GESTAOCLICK_ACCESS_TOKEN');
    const secretToken = Deno.env.get('GESTAOCLICK_SECRET_ACCESS_TOKEN');
    if (!accessToken || !secretToken) throw new Error('API tokens não configurados');

    const body = await req.json().catch(() => ({}));
    const skipCache = body.skipCache || false;
    // Chunked pagination: startPage (1-based), excludedIds (pre-resolved)
    const startPage: number = body.startPage || 0;
    const excludedIdsArr: string[] = body.excludedIds || [];

    const supabase = getSupabaseAdmin();

    // Phase 0: Full cache check (only when startPage=0)
    if (startPage === 0 && !skipCache) {
      const cached = await getCachedSales(supabase);
      if (cached) {
        console.log(`Sales cache hit: ${Object.keys(cached.salesMap).length} products`);
        return new Response(JSON.stringify({
          productSalesMap: cached.salesMap,
          totalVendas: cached.totalVendas,
          excludedStatuses: EXCLUDED_STATUSES,
          cached: true,
          cached_at: cached.cachedAt,
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const apiHeaders = {
      'access-token': accessToken,
      'secret-access-token': secretToken,
      'Content-Type': 'application/json',
    };

    // Phase 1: Init - fetch situacoes + discover total pages
    if (startPage === 0) {
      const [situacoesRes, firstPage] = await Promise.all([
        fetchWithRetry('https://api.gestaoclick.com/api/situacoes_vendas', { method: 'GET', headers: apiHeaders }),
        fetchPage('https://api.gestaoclick.com/api/vendas', 1, apiHeaders),
      ]);

      if (!situacoesRes.ok) throw new Error(`Situacoes error: ${situacoesRes.status}`);
      const situacoesData = await situacoesRes.json();
      const situacoes = situacoesData?.data || [];

      const excludedIds: string[] = [];
      for (const sit of situacoes) {
        const name = (sit.nome || '').toLowerCase().trim();
        if (EXCLUDED_STATUSES.some(excluded => name.includes(excluded))) {
          excludedIds.push(String(sit.id));
        }
      }

      console.log('Situações encontradas:', situacoes.map((s: any) => `${s.id}: ${s.nome}`));
      console.log('IDs excluídos:', excludedIds);

      const excludedSet = new Set(excludedIds);
      const totalPages = firstPage.meta.total_paginas || 1;

      // Process page 1 vendas
      const vendas = firstPage.data.filter((v: any) => !excludedSet.has(String(v.situacao_id)));

      // Build situacao lookup
      const situacaoLookup: Record<string, string> = {};
      for (const sit of situacoes) {
        situacaoLookup[String(sit.id)] = sit.nome;
      }

      const chunkResult = buildProductSalesFromVendas(vendas, situacaoLookup);

      return new Response(JSON.stringify({
        phase: 'init',
        totalPages,
        excludedIds,
        situacaoLookup,
        chunk: chunkResult,
        startPage: 1,
        endPage: 1,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Phase 2: Continue - fetch a batch of pages
    const situacaoLookup: Record<string, string> = body.situacaoLookup || {};
    const totalPages: number = body.totalPages || 1;
    const excludedSet = new Set(excludedIdsArr);

    const endPage = Math.min(startPage + PAGES_PER_CHUNK - 1, totalPages);
    const pages: number[] = [];
    for (let p = startPage; p <= endPage; p++) pages.push(p);

    const results = await Promise.all(
      pages.map(p => fetchPage('https://api.gestaoclick.com/api/vendas', p, apiHeaders))
    );

    const vendas: any[] = [];
    for (const result of results) {
      for (const venda of result.data) {
        if (!excludedSet.has(String(venda.situacao_id))) {
          vendas.push(venda);
        }
      }
    }

    const chunkResult = buildProductSalesFromVendas(vendas, situacaoLookup);
    const done = endPage >= totalPages;

    const response: any = {
      phase: 'chunk',
      chunk: chunkResult,
      startPage,
      endPage,
      totalPages,
      done,
    };

    // If done, signal to save cache
    if (done) {
      response.phase = 'done';
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function buildProductSalesFromVendas(vendas: any[], situacaoLookup: Record<string, string>) {
  const productSalesMap: Record<string, any[]> = {};

  for (const venda of vendas) {
    const clienteNome = String(venda.nome_cliente || venda.cliente_nome || venda.razao_social || 'N/A').trim();

    const vendaInfo = {
      venda_id: String(venda.id),
      codigo: String(venda.codigo || ''),
      cliente_nome: clienteNome,
      situacao: situacaoLookup[String(venda.situacao_id)] || 'Desconhecida',
      data: venda.data || '',
      valor_total: String(venda.valor_total || '0'),
      produtos: [] as any[],
    };

    const items = venda.produtos || venda.itens || [];
    for (const item of items) {
      const resolvedCode = extractProductCode(item);
      if (!resolvedCode) continue;

      vendaInfo.produtos.push({
        nome: item.nome || item.produto_nome || item.produto?.nome_produto || '',
        codigo: resolvedCode,
        quantidade: String(item.quantidade || item.produto?.quantidade || '1'),
        valor_unitario: String(item.valor_unitario || item.produto?.valor_venda || '0'),
      });

      if (!productSalesMap[resolvedCode]) {
        productSalesMap[resolvedCode] = [];
      }
      if (!productSalesMap[resolvedCode].find((v: any) => v.venda_id === vendaInfo.venda_id)) {
        productSalesMap[resolvedCode].push(vendaInfo);
      }
    }
  }

  return { productSalesMap, vendasCount: vendas.length };
}

// Separate endpoint for saving cache (called by frontend after aggregation)
// The frontend will call with { action: 'saveCache', productSalesMap }
