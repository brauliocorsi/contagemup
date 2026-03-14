import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const EXCLUDED_STATUSES = ['conferido', 'produto entregue', 'cancelado', 'levantado'];
const CACHE_TTL_MINUTES = 15;
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 50;

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
}

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

function normalizePostalCode(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  const formattedMatch = raw.match(/\b(\d{4})\s*-\s*(\d{3})\b/);
  if (formattedMatch) {
    return `${formattedMatch[1]}-${formattedMatch[2]}`;
  }

  const digits = raw.replace(/\D/g, '');
  if (digits.length === 7) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }

  return '';
}

function extractPostalCodeFromText(value: unknown): string {
  const text = String(value ?? '');
  if (!text) return '';

  const formattedMatch = text.match(/\b\d{4}\s*-\s*\d{3}\b/);
  if (formattedMatch) {
    return normalizePostalCode(formattedMatch[0]);
  }

  const compactMatch = text.match(/\b\d{7}\b/);
  if (compactMatch) {
    return normalizePostalCode(compactMatch[0]);
  }

  return '';
}

function extractAddressEntries(venda: any): any[] {
  const enderecos = Array.isArray(venda?.enderecos) ? venda.enderecos : [];
  return enderecos.map((entry: any) => {
    const nestedEndereco = entry?.endereco && typeof entry.endereco === 'object'
      ? entry.endereco
      : {};

    return { ...nestedEndereco, ...entry };
  });
}

function firstNonEmpty(...values: unknown[]): string {
  for (const value of values) {
    const parsed = String(value ?? '').trim();
    if (parsed) return parsed;
  }
  return '';
}

function extractProductReferences(item: any): { productCode: string; productId: string; variationId: string } {
  const product = item?.produto || {};

  const productCodeCandidates = [
    item?.codigo_interno, item?.codigo, item?.produto_codigo,
    item?.produto_codigo_interno, item?.variacao_codigo, item?.variacao?.codigo,
    product?.codigo_interno, product?.codigo, product?.produto_codigo,
    product?.codigo_produto, product?.variacao_codigo, product?.referencia,
  ];

  const productIdCandidates = [item?.produto_id, item?.product_id, product?.produto_id, product?.id];
  const variationIdCandidates = [item?.variacao_id, item?.variation_id, item?.variacao?.id, product?.variacao_id, product?.variacao?.id];

  const productCode = normalizeCode(productCodeCandidates.find((v) => String(v ?? '').trim() !== ''));
  const productId = normalizeIdentifier(productIdCandidates.find((v) => String(v ?? '').trim() !== ''));
  const variationId = normalizeIdentifier(variationIdCandidates.find((v) => String(v ?? '').trim() !== ''));

  return { productCode, productId, variationId };
}

async function getCachedSales(supabase: any): Promise<{ salesMap: Record<string, any[]>; totalVendas: number; cachedAt: string } | null> {
  const cutoff = new Date(Date.now() - CACHE_TTL_MINUTES * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('erp_sales_cache')
    .select('product_code, venda_data, fetched_at')
    .gte('fetched_at', cutoff)
    .limit(1);

  if (error || !data || data.length === 0) return null;

  const { data: allData, error: allError } = await supabase
    .from('erp_sales_cache')
    .select('product_code, venda_data, fetched_at')
    .gte('fetched_at', cutoff);

  if (allError || !allData || allData.length === 0) return null;

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

    if (!accessToken) throw new Error('GESTAOCLICK_ACCESS_TOKEN não configurado');
    if (!secretToken) throw new Error('GESTAOCLICK_SECRET_ACCESS_TOKEN não configurado');

    const body = await req.json().catch(() => ({}));
    const skipCache = body.skipCache || false;

    const supabase = getSupabaseAdmin();

    // Check cache
    if (!skipCache) {
      const cached = await getCachedSales(supabase);
      if (cached) {
        console.log(`Sales cache hit: ${Object.keys(cached.salesMap).length} products from ${cached.cachedAt}`);
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

    // Step 1 + first vendas page in parallel
    const [situacoesRes, firstVendasPage] = await Promise.all([
      fetchWithRetry('https://api.gestaoclick.com/api/situacoes_vendas', { method: 'GET', headers: apiHeaders }),
      fetchPage('https://api.gestaoclick.com/api/vendas', 1, apiHeaders),
    ]);

    if (!situacoesRes.ok) {
      throw new Error(`Failed to fetch situacoes_vendas: ${situacoesRes.status}`);
    }

    const situacoesData = await situacoesRes.json();
    const situacoes = situacoesData?.data || [];

    const excludedIds = new Set<string>();
    for (const sit of situacoes) {
      const name = (sit.nome || '').toLowerCase().trim();
      if (EXCLUDED_STATUSES.some(excluded => name.includes(excluded))) {
        excludedIds.add(String(sit.id));
      }
    }

    console.log('Situações encontradas:', situacoes.map((s: any) => `${s.id}: ${s.nome}`));
    console.log('IDs excluídos:', [...excludedIds]);

    // Process first page of vendas
    const allVendas: any[] = [];
    const totalPages = firstVendasPage.meta.total_paginas || 1;

    // Process first page of vendas
    const allVendas: any[] = [];
    const totalPages = firstVendasPage.meta.total_paginas || 1;

    for (const venda of firstVendasPage.data) {
      if (!excludedIds.has(String(venda.situacao_id))) {
        allVendas.push(venda);
      }
    }

    // Fetch remaining pages
    for (let batchStart = 2; batchStart <= totalPages; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, totalPages);
      const pages = [];
      for (let p = batchStart; p <= batchEnd; p++) pages.push(p);

      const results = await Promise.all(
        pages.map(p => fetchPage('https://api.gestaoclick.com/api/vendas', p, apiHeaders))
      );

      for (const result of results) {
        for (const venda of result.data) {
          if (!excludedIds.has(String(venda.situacao_id))) {
            allVendas.push(venda);
          }
        }
      }

      if (batchEnd < totalPages) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    // Step 3: Build product ID/variation ID map
    const requiredProductIds = new Set<string>();
    const requiredVariationIds = new Set<string>();

    for (const venda of allVendas) {
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
          const productId = normalizeIdentifier(product?.id);
          const fallbackCode = normalizeCode(product?.codigo_interno || product?.codigo);

          if (productId && fallbackCode) {
            productCodeByProductId[productId] = fallbackCode;
            pendingProductIds.delete(productId);
          }

          const variacoes = Array.isArray(product?.variacoes) ? product.variacoes : [];
          for (const variationWrapper of variacoes) {
            const variation = variationWrapper?.variacao || variationWrapper || {};
            const variationId = normalizeIdentifier(variation?.id || variation?.variacao_id);
            const variationCode = normalizeCode(variation?.codigo || variation?.codigo_interno || fallbackCode);

            if (variationId && variationCode) {
              productCodeByVariationId[variationId] = variationCode;
              pendingVariationIds.delete(variationId);
            }
          }
        }
      };

      consumeProducts(firstProductsPage.data);

      for (
        let batchStart = 2;
        batchStart <= totalProductPages && (pendingProductIds.size > 0 || pendingVariationIds.size > 0);
        batchStart += BATCH_SIZE
      ) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, totalProductPages);
        const pages: number[] = [];
        for (let p = batchStart; p <= batchEnd; p++) pages.push(p);

        const results = await Promise.all(
          pages.map((p) => fetchPage(productsBaseUrl, p, apiHeaders))
        );

        for (const result of results) {
          consumeProducts(result.data);
        }

        if (batchEnd < totalProductPages) {
          await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
        }
      }
    }

    // Step 4: Build product sales map
    const productSalesMap: Record<string, any[]> = {};
    const situacaoLookup: Record<string, string> = {};
    for (const sit of situacoes) {
      situacaoLookup[String(sit.id)] = sit.nome;
    }

    for (const venda of allVendas) {
      const clienteNome = firstNonEmpty(
        venda.nome_cliente,
        venda.cliente_nome,
        venda.razao_social,
        'N/A'
      );

      const vendaInfo = {
        venda_id: String(venda.id),
        codigo: String(venda.codigo || ''),
        cliente_id: String(venda.cliente_id || ''),
        cliente_nome: clienteNome,
        cliente_endereco: '',
        cliente_cidade: '',
        cliente_cep: '',
        cliente_estado: '',
        situacao: situacaoLookup[String(venda.situacao_id)] || 'Desconhecida',
        data: venda.data || '',
        valor_total: String(venda.valor_total || '0'),
        produtos: [] as any[],
      };

      const items = venda.produtos || venda.itens || [];
      for (const item of items) {
        const refs = extractProductReferences(item);
        const resolvedCode = refs.productCode
          || (refs.variationId ? productCodeByVariationId[refs.variationId] : '')
          || (refs.productId ? productCodeByProductId[refs.productId] : '');

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

    // Save to cache in background
    saveToSalesCache(supabase, productSalesMap).catch(err => console.error('Sales cache save error:', err));

    return new Response(JSON.stringify({
      productSalesMap,
      totalVendas: allVendas.length,
      excludedStatuses: EXCLUDED_STATUSES,
      situacoes: situacoes.map((s: any) => ({ id: s.id, nome: s.nome })),
      cached: false,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error fetching GestãoClick vendas:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
