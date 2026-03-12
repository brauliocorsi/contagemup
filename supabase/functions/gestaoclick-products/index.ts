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
      console.error(`Attempt ${attempt}/${maxRetries} failed for ${url}:`, error);
      if (attempt === maxRetries) throw error;
      // Wait longer between retries: 1s, 3s, 6s
      await new Promise(resolve => setTimeout(resolve, attempt * 2000));
    }
  }
  throw new Error('All retries exhausted');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const accessToken = Deno.env.get('GESTAOCLICK_ACCESS_TOKEN');
    const secretToken = Deno.env.get('GESTAOCLICK_SECRET_ACCESS_TOKEN');

    if (!accessToken) {
      throw new Error('GESTAOCLICK_ACCESS_TOKEN não configurado');
    }
    if (!secretToken) {
      throw new Error('GESTAOCLICK_SECRET_ACCESS_TOKEN não configurado');
    }

    const body = await req.json().catch(() => ({}));
    const fetchAll = body.fetchAll || false;
    const page = body.page || 1;
    const searchCode = body.codigo || null;
    const searchName = body.nome || null;

    const headers = {
      'access-token': accessToken,
      'secret-access-token': secretToken,
      'Content-Type': 'application/json',
    };

    // If fetchAll, fetch ALL pages in the edge function to avoid many client calls
    if (fetchAll) {
      const allProducts: any[] = [];
      let currentPage = 1;
      let hasMore = true;
      let totalPages = 0;

      while (hasMore) {
        const url = new URL('https://api.gestaoclick.com/api/produtos');
        url.searchParams.set('pagina', String(currentPage));
        url.searchParams.set('ativo', '1');

        const response = await fetchWithRetry(url.toString(), {
          method: 'GET',
          headers,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`GestãoClick API error [${response.status}]: ${errorText}`);
        }

        const data = await response.json();
        const products = data?.data || [];
        const meta = data?.meta || {};

        if (meta.total_paginas && !totalPages) {
          totalPages = meta.total_paginas;
        }

        if (Array.isArray(products) && products.length > 0) {
          allProducts.push(...products);

          if (meta.proxima_pagina) {
            currentPage = meta.proxima_pagina;
          } else {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }

        // Small delay between pages to avoid connection issues
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 300));
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

    // Single page fetch (original behavior)
    const url = new URL('https://api.gestaoclick.com/api/produtos');
    url.searchParams.set('pagina', String(page));
    url.searchParams.set('ativo', '1');
    if (searchCode) url.searchParams.set('codigo', searchCode);
    if (searchName) url.searchParams.set('nome', searchName);

    const response = await fetchWithRetry(url.toString(), {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GestãoClick API error [${response.status}]: ${errorText}`);
    }

    const data = await response.json();

    return new Response(JSON.stringify(data), {
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
