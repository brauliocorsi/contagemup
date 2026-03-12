const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

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

    // Parse request body for pagination/filters
    const body = await req.json().catch(() => ({}));
    const page = body.page || 1;

    const url = new URL('https://api.gestaoclick.com/api/produtos');
    url.searchParams.set('pagina', String(page));
    url.searchParams.set('ativo', '1');

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'access-token': accessToken,
        'secret-access-token': secretToken,
        'Content-Type': 'application/json',
      },
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
