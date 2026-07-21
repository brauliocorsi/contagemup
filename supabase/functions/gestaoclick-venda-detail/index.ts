import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

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

    const body = await req.json().catch(() => ({}));
    const vendaId = body.venda_id;
    const vendaCodigo = body.venda_codigo;
    if (!vendaId && !vendaCodigo) throw new Error('venda_id ou venda_codigo é obrigatório');

    const apiHeaders = {
      'access-token': accessToken,
      'secret-access-token': secretToken,
      'Content-Type': 'application/json',
    };

    let internalId = vendaId;

    // If we received a codigo instead of an internal ID, search for it first
    if (vendaCodigo || (!vendaId || vendaId === vendaCodigo)) {
      const searchCode = vendaCodigo || vendaId;
      console.log(`Searching for venda by codigo: ${searchCode}`);
      
      // Search through pages to find the venda by codigo
      let found = false;
      for (let page = 1; page <= 50; page++) {
        const searchUrl = `https://api.gestaoclick.com/api/vendas?pagina=${page}`;
        const searchResp = await fetch(searchUrl, { method: 'GET', headers: apiHeaders });
        
        if (!searchResp.ok) {
          if (searchResp.status === 404) break;
          const errText = await searchResp.text();
          console.error(`Search page ${page} error: ${errText}`);
          break;
        }
        
        const searchData = await searchResp.json();
        const vendas = searchData?.data || [];
        
        if (vendas.length === 0) break;
        
        for (const v of vendas) {
          if (String(v.codigo || '').trim() === String(searchCode).trim()) {
            internalId = String(v.id);
            found = true;
            console.log(`Found venda codigo ${searchCode} -> internal ID ${internalId}`);
            break;
          }
        }
        
        if (found) break;
        
        const totalPages = searchData?.meta?.total_paginas || searchData?.meta?.last_page || 1;
        if (page >= totalPages) break;
      }
      
      if (!found) {
        return new Response(JSON.stringify({ error: `Venda com código ${searchCode} não encontrada` }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const response = await fetch(`https://api.gestaoclick.com/api/vendas/${internalId}`, {
      method: 'GET',
      headers: apiHeaders,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GestãoClick API error [${response.status}]: ${errorText}`);
    }

    const rawData = await response.json();
    const venda = rawData?.data || rawData;

    // Extract products
    const items = venda?.produtos || venda?.itens || [];
    const produtos = items.map((item: any) => {
      const product = item?.produto || {};
      return {
        nome: item.nome || product.nome_produto || product.nome || '',
        codigo: item.codigo_interno || item.codigo || product.codigo_interno || product.codigo || '',
        quantidade: String(item.quantidade || product.quantidade || '1'),
        valor_unitario: String(item.valor_unitario || product.valor_venda || '0'),
        valor_total: String(item.valor_total || '0'),
        unidade: item.unidade || product.unidade || '',
        desconto: String(item.desconto || '0'),
        observacao: item.observacao || '',
      };
    });

    // Extract payment info
    const pagamentos = (venda?.pagamentos || venda?.formas_pagamento || []).map((p: any) => ({
      forma: p.forma_pagamento || p.nome || p.descricao || '',
      valor: String(p.valor || p.valor_pago || '0'),
      parcelas: String(p.parcelas || p.numero_parcelas || '1'),
      vencimento: p.vencimento || p.data_vencimento || '',
      status: p.status || '',
    }));

    // Build response
    const detail = {
      id: String(venda.id || internalId),
      codigo: String(venda.codigo || ''),
      data: venda.data || '',
      data_entrega: venda.data_entrega || venda.previsao_entrega || '',
      situacao: venda.situacao?.nome || venda.situacao_nome || '',
      cliente_nome: venda.nome_cliente || venda.cliente_nome || venda.razao_social || '',
      cliente_documento: venda.cpf_cnpj || venda.documento || '',
      cliente_telefone: venda.telefone || venda.celular || '',
      cliente_email: venda.email || '',
      valor_total: String(venda.valor_total || '0'),
      valor_desconto: String(venda.valor_desconto || venda.desconto || '0'),
      valor_frete: String(venda.valor_frete || venda.frete || '0'),
      observacao: venda.observacao || venda.observacoes || '',
      observacao_interna: venda.observacao_interna || '',
      numero_pedido: venda.numero_pedido || venda.pedido || '',
      transportadora: venda.transportadora || '',
      produtos,
      pagamentos,
      enderecos: (venda.enderecos || []).map((e: any) => {
        const end = e?.endereco || e || {};
        return {
          endereco: end.endereco || end.logradouro || '',
          numero: end.numero || '',
          complemento: end.complemento || '',
          bairro: end.bairro || '',
          cidade: end.cidade || '',
          estado: end.estado || end.uf || '',
          cep: end.cep || '',
        };
      }),
    };

    return new Response(JSON.stringify(detail), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error fetching venda detail:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
