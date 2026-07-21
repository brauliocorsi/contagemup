import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

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

async function fetchPage(page: number, headers: Record<string, string>): Promise<{ products: any[]; meta: any; page: number }> {
  const url = new URL('https://api.gestaoclick.com/api/produtos');
  url.searchParams.set('pagina', String(page));
  url.searchParams.set('ativo', '1');

  const response = await fetchWithRetry(url.toString(), { method: 'GET', headers });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GestãoClick API error [${response.status}] page ${page}: ${errorText}`);
  }

  const data = await response.json();
  return { products: data?.data || [], meta: data?.meta || {}, page };
}

async function getCachedProducts(supabase: any): Promise<{ products: any[]; cachedAt: string } | null> {
  const cutoff = new Date(Date.now() - CACHE_TTL_MINUTES * 60 * 1000).toISOString();
  
  const { data, error } = await supabase
    .from('erp_products_cache')
    .select('code, name, erp_stock, grupo, raw_data, fetched_at')
    .gte('fetched_at', cutoff)
    .limit(1);

  if (error || !data || data.length === 0) return null;

  // All rows share the same fetched_at, so fetch all
  const { data: allData, error: allError } = await supabase
    .from('erp_products_cache')
    .select('raw_data, fetched_at')
    .gte('fetched_at', cutoff);

  if (allError || !allData || allData.length === 0) return null;

  return {
    products: allData.map((row: any) => row.raw_data),
    cachedAt: allData[0].fetched_at,
  };
}

async function saveToCache(supabase: any, products: any[]) {
  // Clear old cache
  await supabase.from('erp_products_cache').delete().lt('fetched_at', new Date().toISOString());

  // Insert in batches of 500
  const now = new Date().toISOString();
  const rows = products.map((p: any) => ({
    code: p.codigo_interno || p.codigo || '',
    name: p.nome || '',
    erp_stock: parseFloat(String(p.estoque ?? '0')) || 0,
    grupo: p.nome_grupo || '',
    raw_data: p,
    fetched_at: now,
  }));

  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    await supabase.from('erp_products_cache').insert(batch);
  }
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

    const body = await req.json().catch(() => ({}));
    const fetchAll = body.fetchAll || false;
    const searchQuery = body.search || '';
    const skipCache = body.skipCache || false;

    const apiHeaders = {
      'access-token': accessToken,
      'secret-access-token': secretToken,
      'Content-Type': 'application/json',
    };

    // Quick search - no cache for search queries
    if (searchQuery) {
      const normalizedSearch = String(searchQuery).toLowerCase().trim();
      const isCodeSearch = /^[a-z0-9._\-/]+$/i.test(normalizedSearch) && normalizedSearch.length >= 4;

      const matchesProduct = (p: any) => {
        const code = String(p.codigo_interno ?? p.codigo ?? '').toLowerCase().trim();
        const name = String(p.nome ?? '').toLowerCase().trim();

        if (isCodeSearch) {
          return code === normalizedSearch || code.startsWith(normalizedSearch) || code.includes(normalizedSearch);
        }

        return code.includes(normalizedSearch) || name.includes(normalizedSearch);
      };

      const fetchFilteredProducts = async (filterKey: 'codigo' | 'nome') => {
        const fetchFilteredPage = async (page: number) => {
          const url = new URL('https://api.gestaoclick.com/api/produtos');
          url.searchParams.set('pagina', String(page));
          url.searchParams.set('ativo', '1');
          url.searchParams.set(filterKey, String(searchQuery).trim());

          const response = await fetchWithRetry(url.toString(), { method: 'GET', headers: apiHeaders });
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`GestãoClick API filtered search error [${response.status}]: ${errorText}`);
          }

          const data = await response.json();
          return { products: data?.data || [], meta: data?.meta || {} };
        };

        const first = await fetchFilteredPage(1);
        const totalPages = first.meta.total_paginas || 1;
        const maxPages = filterKey === 'codigo' ? totalPages : Math.min(totalPages, 10);
        const products = [...first.products];

        for (let batchStart = 2; batchStart <= maxPages; batchStart += BATCH_SIZE) {
          const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, maxPages);
          const pages: number[] = [];
          for (let p = batchStart; p <= batchEnd; p++) pages.push(p);

          const results = await Promise.all(pages.map((p) => fetchFilteredPage(p)));
          for (const result of results) {
            products.push(...result.products);
          }

          if (products.length > 0 && filterKey === 'codigo') break;
        }

        return products;
      };

      let foundProducts: any[] = [];
      let strategy: 'filtered' | 'fallback-scan' = 'filtered';

      try {
        foundProducts = await fetchFilteredProducts(isCodeSearch ? 'codigo' : 'nome');
        foundProducts = foundProducts.filter(matchesProduct);
      } catch (error) {
        console.error('Filtered search failed, fallback to scan:', error);
      }

      if (foundProducts.length === 0) {
        strategy = 'fallback-scan';
        const firstPage = await fetchPage(1, apiHeaders);
        const totalPages = firstPage.meta.total_paginas || 1;

        for (const p of firstPage.products) {
          if (matchesProduct(p)) foundProducts.push(p);
        }

        if (foundProducts.length === 0) {
          const maxPagesToScan = isCodeSearch ? Math.min(totalPages, 80) : Math.min(totalPages, 10);

          for (let batchStart = 2; batchStart <= maxPagesToScan; batchStart += BATCH_SIZE) {
            const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, maxPagesToScan);
            const pages: number[] = [];
            for (let p = batchStart; p <= batchEnd; p++) pages.push(p);

            const results = await Promise.all(pages.map((p) => fetchPage(p, apiHeaders)));

            for (const result of results) {
              for (const p of result.products) {
                if (matchesProduct(p)) foundProducts.push(p);
              }
            }

            if (foundProducts.length > 0) break;
          }
        }
      }

      const uniqueProducts = Array.from(
        new Map(foundProducts.map((p: any) => [String(p.id), p])).values()
      );

      return new Response(JSON.stringify({
        data: uniqueProducts,
        meta: {
          total: uniqueProducts.length,
          searched: true,
          query: searchQuery,
          search_mode: isCodeSearch ? 'code' : 'name',
          strategy,
        },
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (fetchAll) {
      const supabase = getSupabaseAdmin();

      // Check cache first
      if (!skipCache) {
        const cached = await getCachedProducts(supabase);
        if (cached) {
          console.log(`Cache hit: ${cached.products.length} products from ${cached.cachedAt}`);
          return new Response(JSON.stringify({
            data: cached.products,
            meta: { total: cached.products.length, cached: true, cached_at: cached.cachedAt },
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      // Fetch first page to get total pages and expected total
      const first = await fetchPage(1, apiHeaders);
      const totalPages = first.meta.total_paginas || 1;
      const expectedTotal = first.meta.total || null;
      const allProducts = [...first.products];
      const fetchedPages = new Set<number>([1]);
      const failedPages: number[] = [];

      for (let batchStart = 2; batchStart <= totalPages; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, totalPages);
        const pages = [];
        for (let p = batchStart; p <= batchEnd; p++) {
          pages.push(p);
        }

        const results = await Promise.allSettled(
          pages.map(p => fetchPage(p, apiHeaders))
        );

        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          const pageNum = pages[i];
          if (result.status === 'fulfilled') {
            if (Array.isArray(result.value.products)) {
              allProducts.push(...result.value.products);
              fetchedPages.add(pageNum);
            }
          } else {
            console.error(`Failed to fetch page ${pageNum}:`, result.reason);
            failedPages.push(pageNum);
          }
        }

        if (batchEnd < totalPages) {
          await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
        }
      }

      // Retry failed pages individually
      if (failedPages.length > 0) {
        console.log(`Retrying ${failedPages.length} failed pages: ${failedPages.join(', ')}`);
        for (const pageNum of failedPages) {
          try {
            const result = await fetchPage(pageNum, apiHeaders);
            if (Array.isArray(result.products)) {
              allProducts.push(...result.products);
              fetchedPages.add(pageNum);
            }
          } catch (err) {
            console.error(`Retry for page ${pageNum} also failed:`, err);
          }
        }
      }

      // Deduplicate products by ID
      const uniqueProducts = Array.from(
        new Map(allProducts.map((p: any) => [String(p.id), p])).values()
      );

      // Validation: check completeness
      const pagesComplete = fetchedPages.size === totalPages;
      const finalFailedPages = Array.from({ length: totalPages }, (_, i) => i + 1)
        .filter(p => !fetchedPages.has(p));

      console.log(`Sync complete: ${uniqueProducts.length} unique products from ${fetchedPages.size}/${totalPages} pages. Expected: ${expectedTotal || 'unknown'}`);

      // Save to cache only if all pages were fetched
      if (pagesComplete) {
        saveToCache(supabase, uniqueProducts).catch(err => console.error('Cache save error:', err));
      }

      return new Response(JSON.stringify({
        data: uniqueProducts,
        meta: {
          total: uniqueProducts.length,
          total_paginas: totalPages,
          pages_fetched: fetchedPages.size,
          pages_complete: pagesComplete,
          failed_pages: finalFailedPages,
          expected_total: expectedTotal,
          cached: false,
        },
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
