import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const EXCLUDED_STATUSES = ['produto entregue', 'confirmado', 'levantado', 'cancelado', 'conferido'];
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

function firstNonEmpty(...values: unknown[]): string {
  for (const value of values) {
    const parsed = String(value ?? '').trim();
    if (parsed) return parsed;
  }
  return '';
}

function extractAddress(venda: any): { endereco: string; cidade: string; estado: string; cep: string } {
  const enderecos = Array.isArray(venda?.enderecos) ? venda.enderecos : [];
  if (enderecos.length > 0) {
    const entry = enderecos[0];
    const nested = entry?.endereco && typeof entry.endereco === 'object' ? entry.endereco : {};
    const merged = { ...nested, ...entry };
    return {
      endereco: firstNonEmpty(merged.endereco, merged.logradouro, '') +
        (merged.numero ? `, ${merged.numero}` : '') +
        (merged.complemento ? ` - ${merged.complemento}` : ''),
      cidade: firstNonEmpty(merged.cidade, merged.municipio, ''),
      estado: firstNonEmpty(merged.estado, merged.uf, ''),
      cep: firstNonEmpty(merged.cep, ''),
    };
  }
  return {
    endereco: firstNonEmpty(venda.endereco, ''),
    cidade: firstNonEmpty(venda.cidade, ''),
    estado: firstNonEmpty(venda.estado, venda.uf, ''),
    cep: firstNonEmpty(venda.cep, ''),
  };
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
    if (!accessToken || !secretToken) throw new Error('GestãoClick tokens não configurados');

    const apiHeaders = {
      'access-token': accessToken,
      'secret-access-token': secretToken,
      'Content-Type': 'application/json',
    };

    // Fetch situacoes and first vendas page in parallel
    const [situacoesRes, firstPage] = await Promise.all([
      fetchWithRetry('https://api.gestaoclick.com/api/situacoes_vendas', { method: 'GET', headers: apiHeaders }),
      fetchPage('https://api.gestaoclick.com/api/vendas', 1, apiHeaders),
    ]);

    if (!situacoesRes.ok) throw new Error(`Failed to fetch situacoes: ${situacoesRes.status}`);
    const situacoesData = await situacoesRes.json();
    const situacoes = situacoesData?.data || [];

    const excludedIds = new Set<string>();
    const situacaoLookup: Record<string, string> = {};
    for (const sit of situacoes) {
      const name = (sit.nome || '').toLowerCase().trim();
      situacaoLookup[String(sit.id)] = sit.nome;
      if (EXCLUDED_STATUSES.some(excluded => name.includes(excluded))) {
        excludedIds.add(String(sit.id));
      }
    }

    const allVendas: any[] = [];
    const totalPages = firstPage.meta.total_paginas || 1;

    const processVenda = (venda: any) => {
      if (excludedIds.has(String(venda.situacao_id))) return;

      const addr = extractAddress(venda);
      const items = venda.produtos || venda.itens || [];
      const produtos = items.map((item: any) => {
        const product = item?.produto || {};
        return {
          nome: item.nome || product.nome_produto || product.nome || '',
          codigo: item.codigo_interno || item.codigo || product.codigo_interno || product.codigo || '',
          quantidade: String(item.quantidade || '1'),
          valor_unitario: String(item.valor_unitario || product.valor_venda || '0'),
        };
      });

      // Extract payment info
      const pagamentos = venda.pagamentos || venda.formas_pagamento || [];
      const PENDING_METHODS = ['pagar na entrega', 'contra entrega', 'pagamento na entrega', 'cobrar na entrega'];
      let valor_pago = 0;
      let valor_pendente = 0;
      const pagamentosList: any[] = [];

      for (const p of (Array.isArray(pagamentos) ? pagamentos : [])) {
        const forma = String(p.forma_pagamento || p.nome || p.descricao || p.forma || '').trim();
        const valor = parseFloat(String(p.valor || p.valor_pago || '0')) || 0;
        const status = String(p.status || '').toLowerCase().trim();
        const isPending = PENDING_METHODS.some(m => forma.toLowerCase().includes(m))
          || status.includes('pendente')
          || status.includes('aberto')
          || status.includes('aguardando');

        if (isPending) {
          valor_pendente += valor;
        } else {
          valor_pago += valor;
        }
        pagamentosList.push({ forma, valor: String(valor), pendente: isPending });
      }

      // If no payment info, treat full amount as pending
      if (pagamentosList.length === 0) {
        valor_pendente = parseFloat(String(venda.valor_total || '0')) || 0;
      }

      allVendas.push({
        venda_id: String(venda.id),
        codigo: String(venda.codigo || ''),
        data: venda.data || '',
        situacao: situacaoLookup[String(venda.situacao_id)] || 'Desconhecida',
        cliente_nome: firstNonEmpty(venda.nome_cliente, venda.cliente_nome, venda.razao_social, 'N/A'),
        cliente_telefone: firstNonEmpty(venda.telefone, venda.celular, venda.fone, ''),
        cliente_email: firstNonEmpty(venda.email, ''),
        endereco: addr.endereco,
        cidade: addr.cidade,
        estado: addr.estado,
        cep: addr.cep,
        valor_total: String(venda.valor_total || '0'),
        valor_pago: String(valor_pago.toFixed(2)),
        valor_pendente: String(valor_pendente.toFixed(2)),
        pagamentos: pagamentosList,
        produtos,
      });
    };

    for (const venda of firstPage.data) processVenda(venda);

    for (let batchStart = 2; batchStart <= totalPages; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, totalPages);
      const pages = [];
      for (let p = batchStart; p <= batchEnd; p++) pages.push(p);

      const results = await Promise.all(
        pages.map(p => fetchPage('https://api.gestaoclick.com/api/vendas', p, apiHeaders))
      );
      for (const result of results) {
        for (const venda of result.data) processVenda(venda);
      }
      if (batchEnd < totalPages) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    return new Response(JSON.stringify({ vendas: allVendas, total: allVendas.length }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error fetching vendas pendentes:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
