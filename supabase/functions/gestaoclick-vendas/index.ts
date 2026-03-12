const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const EXCLUDED_STATUSES = ['conferido', 'agendado entrega', 'cancelado'];

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
    item?.codigo_interno,
    item?.codigo,
    item?.produto_codigo,
    item?.produto_codigo_interno,
    item?.variacao_codigo,
    item?.variacao?.codigo,
    product?.codigo_interno,
    product?.codigo,
    product?.produto_codigo,
    product?.codigo_produto,
    product?.variacao_codigo,
    product?.referencia,
  ];

  const productIdCandidates = [
    item?.produto_id,
    item?.product_id,
    product?.produto_id,
    product?.id,
  ];

  const variationIdCandidates = [
    item?.variacao_id,
    item?.variation_id,
    item?.variacao?.id,
    product?.variacao_id,
    product?.variacao?.id,
  ];

  const productCode = normalizeCode(productCodeCandidates.find((value) => String(value ?? '').trim() !== ''));
  const productId = normalizeIdentifier(productIdCandidates.find((value) => String(value ?? '').trim() !== ''));
  const variationId = normalizeIdentifier(variationIdCandidates.find((value) => String(value ?? '').trim() !== ''));

  return { productCode, productId, variationId };
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

    const apiHeaders = {
      'access-token': accessToken,
      'secret-access-token': secretToken,
      'Content-Type': 'application/json',
    };

    // Step 1: Fetch situacoes_vendas to get IDs of excluded statuses
    const situacoesRes = await fetchWithRetry('https://api.gestaoclick.com/api/situacoes_vendas', {
      method: 'GET',
      headers: apiHeaders,
    });
    
    if (!situacoesRes.ok) {
      throw new Error(`Failed to fetch situacoes_vendas: ${situacoesRes.status}`);
    }
    
    const situacoesData = await situacoesRes.json();
    const situacoes = situacoesData?.data || [];
    
    // Map situacao names to IDs for exclusion
    const excludedIds = new Set<string>();
    for (const sit of situacoes) {
      const name = (sit.nome || '').toLowerCase().trim();
      if (EXCLUDED_STATUSES.some(excluded => name.includes(excluded))) {
        excludedIds.add(String(sit.id));
      }
    }
    
    console.log('Situações encontradas:', situacoes.map((s: any) => `${s.id}: ${s.nome}`));
    console.log('IDs excluídos:', [...excludedIds]);

    // Step 2: Fetch all vendas
    const allVendas: any[] = [];
    const firstPage = await fetchPage('https://api.gestaoclick.com/api/vendas', 1, apiHeaders);
    const totalPages = firstPage.meta.total_paginas || 1;
    
    // Filter first page
    for (const venda of firstPage.data) {
      if (!excludedIds.has(String(venda.situacao_id))) {
        allVendas.push(venda);
      }
    }

    // Fetch remaining pages in parallel batches
    const BATCH_SIZE = 5;
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
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    // Step 3: Build a map of product codes to their vendas
    const productSalesMap: Record<string, Array<{
      venda_id: string;
      codigo: string;
      cliente_nome: string;
      situacao: string;
      data: string;
      valor_total: string;
      produtos: Array<{ nome: string; codigo: string; quantidade: string; valor_unitario: string }>;
    }>> = {};

    // Build situacao lookup
    const situacaoLookup: Record<string, string> = {};
    for (const sit of situacoes) {
      situacaoLookup[String(sit.id)] = sit.nome;
    }

    // Debug: log first sale item structure
    if (allVendas.length > 0) {
      const firstItems = allVendas[0].produtos || allVendas[0].itens || [];
      if (firstItems.length > 0) {
        console.log('DEBUG - First sale item keys:', Object.keys(firstItems[0]));
        console.log('DEBUG - First sale item:', JSON.stringify(firstItems[0]).substring(0, 500));
      }
    }

    for (const venda of allVendas) {
      const vendaInfo = {
        venda_id: String(venda.id),
        codigo: String(venda.codigo || ''),
        cliente_nome: venda.cliente_nome || venda.cliente?.nome || 'N/A',
        situacao: situacaoLookup[String(venda.situacao_id)] || 'Desconhecida',
        data: venda.data || '',
        valor_total: String(venda.valor_total || '0'),
        produtos: [] as Array<{ nome: string; codigo: string; quantidade: string; valor_unitario: string }>,
      };

      const items = venda.produtos || venda.itens || [];
      for (const item of items) {
        const productCode = String(item.codigo_interno || item.codigo || item.produto_codigo || '');
        if (!productCode) continue;

        vendaInfo.produtos.push({
          nome: item.nome || item.produto_nome || '',
          codigo: productCode,
          quantidade: String(item.quantidade || '1'),
          valor_unitario: String(item.valor_unitario || '0'),
        });

        if (!productSalesMap[productCode]) {
          productSalesMap[productCode] = [];
        }
        // Avoid duplicating the same venda for same product
        if (!productSalesMap[productCode].find(v => v.venda_id === vendaInfo.venda_id)) {
          productSalesMap[productCode].push(vendaInfo);
        }
      }
    }

    return new Response(JSON.stringify({
      productSalesMap,
      totalVendas: allVendas.length,
      excludedStatuses: EXCLUDED_STATUSES,
      situacoes: situacoes.map((s: any) => ({ id: s.id, nome: s.nome })),
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
