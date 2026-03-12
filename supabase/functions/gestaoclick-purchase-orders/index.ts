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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const accessToken = Deno.env.get('GESTAOCLICK_ACCESS_TOKEN');
    const secretToken = Deno.env.get('GESTAOCLICK_SECRET_ACCESS_TOKEN');
    if (!accessToken) throw new Error('GESTAOCLICK_ACCESS_TOKEN não configurado');
    if (!secretToken) throw new Error('GESTAOCLICK_SECRET_ACCESS_TOKEN não configurado');

    const body = await req.json();
    const targetDate = body?.date; // YYYY-MM-DD (yesterday typically)

    if (!targetDate) {
      throw new Error('Parâmetro "date" é obrigatório (formato YYYY-MM-DD)');
    }

    const apiHeaders = {
      'access-token': accessToken,
      'secret-access-token': secretToken,
      'Content-Type': 'application/json',
    };

    // Step 1: Fetch all situacoes_vendas to find "completed" sale statuses
    const situacoesRes = await fetchWithRetry('https://api.gestaoclick.com/api/situacoes_vendas', {
      method: 'GET', headers: apiHeaders,
    });
    if (!situacoesRes.ok) throw new Error(`Failed to fetch situacoes_vendas: ${situacoesRes.status}`);
    const situacoesData = await situacoesRes.json();
    const situacoes = situacoesData?.data || [];

    const situacaoLookup: Record<string, string> = {};
    for (const sit of situacoes) {
      situacaoLookup[String(sit.id)] = sit.nome || '';
    }

    // Step 2: Fetch vendas - use date params and stop early
    const matchingVendas: any[] = [];
    // Try multiple date param formats the API might support
    const vendasBaseUrl = `https://api.gestaoclick.com/api/vendas?data_inicial=${targetDate}&data_final=${targetDate}`;
    
    console.log(`Fetching vendas for date: ${targetDate}`);
    
    const firstPage = await fetchPage(vendasBaseUrl, 1, apiHeaders);
    const totalPages = Math.min(firstPage.meta.total_paginas || 1, 30); // Cap at 30 pages max
    
    console.log(`Page 1: ${firstPage.data.length} vendas, total_paginas from API: ${firstPage.meta.total_paginas}`);

    let stopEarly = false;

    const processVendas = (vendas: any[]): boolean => {
      let foundAny = false;
      for (const venda of vendas) {
        const vendaDate = normalizeDateStr(venda.data || '');
        if (vendaDate === targetDate) {
          matchingVendas.push(venda);
          foundAny = true;
        }
      }
      return foundAny;
    };

    processVendas(firstPage.data);

    const BATCH_SIZE = 5;
    for (let batchStart = 2; batchStart <= totalPages && !stopEarly; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, totalPages);
      const pages = [];
      for (let p = batchStart; p <= batchEnd; p++) pages.push(p);
      const results = await Promise.all(
        pages.map(p => fetchPage(vendasBaseUrl, p, apiHeaders))
      );
      let batchHadMatches = false;
      for (const result of results) {
        if (processVendas(result.data)) batchHadMatches = true;
      }
      // If after several pages with no matches and we already have some, stop
      if (!batchHadMatches && matchingVendas.length > 0) {
        stopEarly = true;
      }
      if (batchEnd < totalPages && !stopEarly) await new Promise(resolve => setTimeout(resolve, 150));
    }
    
    console.log(`Total matching vendas: ${matchingVendas.length}, stopped early: ${stopEarly}`);

    // Step 3: Resolve product codes
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
      for (let bs = 2; bs <= totalProductPages && (pendingProductIds.size > 0 || pendingVariationIds.size > 0); bs += 5) {
        const be = Math.min(bs + 4, totalProductPages);
        const pgs = []; for (let p = bs; p <= be; p++) pgs.push(p);
        const res = await Promise.all(pgs.map(p => fetchPage(productsBaseUrl, p, apiHeaders)));
        for (const r of res) consumeProducts(r.data);
        if (be < totalProductPages) await new Promise(r => setTimeout(r, 150));
      }
    }

    // Step 4: Build sold items list with quantities
    const soldItems: Array<{
      productCode: string;
      productName: string;
      totalSold: number;
      vendas: Array<{ codigo: string; cliente: string; situacao: string; quantidade: number }>;
    }> = [];

    const soldMap = new Map<string, {
      productCode: string;
      productName: string;
      totalSold: number;
      vendas: Array<{ codigo: string; cliente: string; situacao: string; quantidade: number }>;
    }>();

    for (const venda of matchingVendas) {
      const items = venda.produtos || venda.itens || [];
      for (const item of items) {
        const refs = extractProductReferences(item);
        const resolvedCode = refs.productCode
          || (refs.variationId ? productCodeByVariationId[refs.variationId] : '')
          || (refs.productId ? productCodeByProductId[refs.productId] : '');

        if (!resolvedCode) continue;

        const qty = parseInt(String(item.quantidade || item.produto?.quantidade || '1'), 10) || 1;
        const key = resolvedCode.toLowerCase();
        const existing = soldMap.get(key);

        const vendaInfo = {
          codigo: String(venda.codigo || ''),
          cliente: venda.cliente_nome || venda.cliente?.nome || 'N/A',
          situacao: situacaoLookup[String(venda.situacao_id)] || 'Desconhecida',
          quantidade: qty,
        };

        if (existing) {
          existing.totalSold += qty;
          existing.vendas.push(vendaInfo);
        } else {
          soldMap.set(key, {
            productCode: resolvedCode,
            productName: item.nome || item.produto_nome || item.produto?.nome_produto || '',
            totalSold: qty,
            vendas: [vendaInfo],
          });
        }
      }
    }

    return new Response(JSON.stringify({
      soldItems: Array.from(soldMap.values()),
      totalVendas: matchingVendas.length,
      targetDate,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error fetching purchase orders:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
