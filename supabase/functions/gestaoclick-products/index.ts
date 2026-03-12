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

async function fetchPage(page: number, headers: Record<string, string>): Promise<{ products: any[]; meta: any }> {
  const url = new URL('https://api.gestaoclick.com/api/produtos');
  url.searchParams.set('pagina', String(page));
  url.searchParams.set('ativo', '1');

  const response = await fetchWithRetry(url.toString(), { method: 'GET', headers });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GestãoClick API error [${response.status}]: ${errorText}`);
  }

  const data = await response.json();
  return { products: data?.data || [], meta: data?.meta || {} };
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
    const fetchAll = body.fetchAll || false;
    const searchQuery = body.search || '';

    // Quick single-product search by code/name (searches page by page until found)
    if (searchQuery) {
      const normalizedSearch = searchQuery.toLowerCase().trim();
      let page = 1;
      let totalPages = 1;
      const foundProducts: any[] = [];

      while (page <= totalPages) {
        const result = await fetchPage(page, apiHeaders);
        if (page === 1) totalPages = result.meta.total_paginas || 1;

        for (const p of result.products) {
          const code = (p.codigo_interno || p.codigo || '').toLowerCase();
          const name = (p.nome || '').toLowerCase();
          if (code.includes(normalizedSearch) || name.includes(normalizedSearch)) {
            foundProducts.push(p);
          }
        }

        // Stop early if we found results and scanned at least a few pages
        if (foundProducts.length > 0 && page >= Math.min(3, totalPages)) break;
        page++;
      }

      return new Response(JSON.stringify({
        data: foundProducts,
        meta: { total: foundProducts.length, searched: true },
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiHeaders = {
      'access-token': accessToken,
      'secret-access-token': secretToken,
      'Content-Type': 'application/json',
    };

    if (fetchAll) {
      // Step 1: Fetch page 1 to get total_paginas
      const first = await fetchPage(1, apiHeaders);
      const totalPages = first.meta.total_paginas || 1;
      const allProducts = [...first.products];

      // Step 2: Fetch remaining pages in parallel batches of 5
      const BATCH_SIZE = 5;
      for (let batchStart = 2; batchStart <= totalPages; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, totalPages);
        const pages = [];
        for (let p = batchStart; p <= batchEnd; p++) {
          pages.push(p);
        }

        const results = await Promise.all(
          pages.map(p => fetchPage(p, apiHeaders))
        );

        for (const result of results) {
          if (Array.isArray(result.products)) {
            allProducts.push(...result.products);
          }
        }

        // Small delay between batches to avoid connection issues
        if (batchEnd < totalPages) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      return new Response(JSON.stringify({
        data: allProducts,
        meta: { total: allProducts.length, total_paginas: totalPages },
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Single page fetch
    const page = body.page || 1;
    const result = await fetchPage(page, apiHeaders);

    return new Response(JSON.stringify({
      code: 200,
      data: result.products,
      meta: result.meta,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error fetching GestãoClick products:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
