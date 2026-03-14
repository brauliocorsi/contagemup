import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 50;

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
    const searchName = body.searchName || '';

    const apiHeaders = {
      'access-token': accessToken,
      'secret-access-token': secretToken,
      'Content-Type': 'application/json',
    };

    // Fetch clients from GestãoClick
    const baseUrl = 'https://api.gestaoclick.com/api/clientes';
    const firstPage = await fetchPage(baseUrl, 1, apiHeaders);
    const totalPages = firstPage.meta.total_paginas || 1;

    const allClients: any[] = [];

    const processClients = (data: any[]) => {
      for (const client of data) {
        // Extract address from nested enderecos[].endereco structure
        const enderecos = Array.isArray(client.enderecos) ? client.enderecos : [];
        const addr = enderecos[0]?.endereco || enderecos[0] || {};
        
        const addressParts = [
          addr.logradouro, addr.rua, addr.endereco, addr.morada,
          addr.numero, addr.complemento, addr.bairro,
        ].map((v: any) => String(v ?? '').trim()).filter(Boolean);
        
        const fullAddress = addressParts.join(', ');
        
        // Extract postal code from all text fields (CEP is often in 'numero' field)
        const allText = [
          addr.cep, addr.codigo_postal, addr.postal_code,
          addr.numero, addr.logradouro, addr.complemento,
          fullAddress,
        ].map((v: any) => String(v ?? '').trim()).filter(Boolean).join(' ');
        
        // Match XXXX-XXX pattern
        let cep = '';
        const formattedMatch = allText.match(/\b(\d{4})\s*-\s*(\d{3})\b/);
        if (formattedMatch) {
          cep = `${formattedMatch[1]}-${formattedMatch[2]}`;
        } else {
          const compactMatch = allText.match(/\b(\d{7})\b/);
          if (compactMatch) {
            const d = compactMatch[1];
            cep = `${d.slice(0, 4)}-${d.slice(4)}`;
          }
        }

        const clientInfo = {
          id: String(client.id || ''),
          nome: client.nome || client.razao_social || '',
          endereco: fullAddress || client.endereco || '',
          numero: addr.numero || client.numero || '',
          bairro: addr.bairro || client.bairro || '',
          cidade: addr.nome_cidade || client.cidade || '',
          estado: addr.estado || client.estado || '',
          cep: cep || addr.cep || client.cep || client.codigo_postal || '',
          complemento: addr.complemento || client.complemento || '',
          email: client.email || '',
          telefone: client.telefone || client.celular || '',
          pais: addr.pais || client.pais || 'Portugal',
        };

        // If searching, filter by name
        if (searchName) {
          const normalizedSearch = searchName.toLowerCase().trim();
          const normalizedName = clientInfo.nome.toLowerCase().trim();
          if (!normalizedName.includes(normalizedSearch)) continue;
        }

        allClients.push(clientInfo);
      }
    };

    processClients(firstPage.data);

    // Fetch remaining pages
    for (let batchStart = 2; batchStart <= totalPages; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, totalPages);
      const pages: number[] = [];
      for (let p = batchStart; p <= batchEnd; p++) pages.push(p);

      const results = await Promise.all(
        pages.map(p => fetchPage(baseUrl, p, apiHeaders))
      );

      for (const result of results) {
        processClients(result.data);
      }

      if (batchEnd < totalPages) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    return new Response(JSON.stringify({
      clients: allClients,
      total: allClients.length,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error fetching GestãoClick clients:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
