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

function getApiHeaders() {
  const accessToken = Deno.env.get('GESTAOCLICK_ACCESS_TOKEN');
  const secretToken = Deno.env.get('GESTAOCLICK_SECRET_ACCESS_TOKEN');
  if (!accessToken) throw new Error('GESTAOCLICK_ACCESS_TOKEN não configurado');
  if (!secretToken) throw new Error('GESTAOCLICK_SECRET_ACCESS_TOKEN não configurado');
  return {
    'access-token': accessToken,
    'secret-access-token': secretToken,
    'Content-Type': 'application/json',
  };
}

// Action: list-suppliers - List all suppliers
async function listSuppliers(apiHeaders: Record<string, string>, search?: string) {
  const allSuppliers: any[] = [];
  let page = 1;
  const maxPages = 20;

  while (page <= maxPages) {
    const url = new URL('https://api.gestaoclick.com/api/fornecedores');
    url.searchParams.set('pagina', String(page));
    if (search) url.searchParams.set('nome', search);

    const response = await fetchWithRetry(url.toString(), { method: 'GET', headers: apiHeaders });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Fornecedores API error [${response.status}]: ${errorText}`);
    }

    const data = await response.json();
    const suppliers = data?.data || [];
    allSuppliers.push(...suppliers);

    const totalPages = data?.meta?.total_paginas || 1;
    if (page >= totalPages) break;
    page++;
  }

  return allSuppliers;
}

// Action: find-products - Find products matching a name filter
async function findProductsByName(apiHeaders: Record<string, string>, nameFilter: string) {
  const allProducts: any[] = [];
  let page = 1;
  const maxPages = 100;

  while (page <= maxPages) {
    const url = new URL('https://api.gestaoclick.com/api/produtos');
    url.searchParams.set('pagina', String(page));
    url.searchParams.set('ativo', '1');
    url.searchParams.set('nome', nameFilter);

    const response = await fetchWithRetry(url.toString(), { method: 'GET', headers: apiHeaders });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Produtos API error [${response.status}]: ${errorText}`);
    }

    const data = await response.json();
    const products = data?.data || [];
    allProducts.push(...products);

    const totalPages = data?.meta?.total_paginas || 1;
    if (page >= totalPages) break;
    page++;
  }

  return allProducts;
}

// Action: update-product - PUT to update a single product's supplier
async function testSupplierFields(apiHeaders: Record<string, string>, productId: string, fornecedorId: string) {
  // First GET the product to have its full data
  const getUrl = `https://api.gestaoclick.com/api/produtos/${productId}`;
  const getResp = await fetchWithRetry(getUrl, { method: 'GET', headers: apiHeaders });
  const getData = await getResp.json();
  const product = getData?.data || getData;

  // Try different field name variations
  const fieldVariations = [
    { fornecedor_id: fornecedorId },
    { fornecedores: [{ fornecedor_id: fornecedorId }] },
    { fornecedores: [{ id: fornecedorId }] },
    { nome_fornecedor: "UP Fábrica" },
    { fornecedor: fornecedorId },
    { fornecedores_ids: [fornecedorId] },
  ];

  const results: any[] = [];
  
  for (const fields of fieldVariations) {
    const payload = {
      nome: product.nome,
      codigo_interno: product.codigo_interno,
      ...fields,
    };

    const response = await fetchWithRetry(getUrl, {
      method: 'PUT',
      headers: apiHeaders,
      body: JSON.stringify(payload),
    });
    const respText = await response.text();
    let respData: any;
    try { respData = JSON.parse(respText); } catch { respData = { raw: respText }; }
    
    results.push({
      fields_sent: fields,
      status: response.status,
      ok: response.ok,
      response: respData,
    });
    
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  return results;
}

async function updateProductSupplier(apiHeaders: Record<string, string>, productId: string, fornecedorId: string, productData?: any) {
  const url = `https://api.gestaoclick.com/api/produtos/${productId}`;
  
  const payload: any = { fornecedor_id: fornecedorId };
  if (productData) {
    payload.nome = productData.nome;
    if (productData.codigo_interno) payload.codigo_interno = productData.codigo_interno;
  }
  
  const response = await fetchWithRetry(url, {
    method: 'PUT',
    headers: apiHeaders,
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();
  let responseData: any;
  try {
    responseData = JSON.parse(responseText);
  } catch {
    responseData = { raw: responseText };
  }

  return {
    status: response.status,
    ok: response.ok,
    data: responseData,
  };
}

// Action: bulk-update - Find products and update supplier in bulk
async function bulkUpdateSupplier(
  apiHeaders: Record<string, string>,
  nameFilter: string,
  supplierName: string,
  dryRun: boolean,
  offset: number = 0,
  limit: number = 30
) {
  // Step 1: Find supplier
  const suppliers = await listSuppliers(apiHeaders, supplierName);
  const supplier = suppliers.find((s: any) => 
    String(s.nome || s.razao_social || '').toLowerCase().includes(supplierName.toLowerCase())
  );

  if (!supplier) {
    return { 
      success: false, 
      error: `Fornecedor "${supplierName}" não encontrado`,
      available_suppliers: suppliers.map((s: any) => ({ id: s.id, nome: s.nome || s.razao_social })).slice(0, 20),
    };
  }

  // Step 2: Find products
  const products = await findProductsByName(apiHeaders, nameFilter);
  const filtered = products.filter((p: any) => {
    const nome = String(p.nome || '').toLowerCase();
    return nome.includes('cama estofada') || nome.includes('cam estofada');
  });

  const batch = filtered.slice(offset, offset + limit);

  if (dryRun) {
    return {
      success: true,
      dry_run: true,
      supplier: { id: supplier.id, nome: supplier.nome || supplier.razao_social },
      products_count: filtered.length,
      products: filtered.map((p: any) => ({
        id: p.id,
        codigo: p.codigo_interno || p.codigo,
        nome: p.nome,
        fornecedor_atual: p.nome_fornecedor || p.fornecedor_id || 'N/A',
      })),
    };
  }

  // Step 3: Update batch
  const results: any[] = [];
  let successCount = 0;
  let failCount = 0;

  for (const product of batch) {
    try {
      const result = await updateProductSupplier(apiHeaders, product.id, supplier.id, product);
      results.push({
        product_id: product.id,
        nome: product.nome,
        ok: result.ok,
      });
      if (result.ok) successCount++;
      else failCount++;
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (err) {
      failCount++;
      results.push({
        product_id: product.id,
        nome: product.nome,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    success: true,
    supplier: { id: supplier.id, nome: supplier.nome || supplier.razao_social },
    total: filtered.length,
    offset,
    limit,
    batch_size: batch.length,
    success_count: successCount,
    fail_count: failCount,
    has_more: offset + limit < filtered.length,
    next_offset: offset + limit,
    results,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiHeaders = getApiHeaders();
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'list-suppliers';

    let result: any;

    switch (action) {
      case 'list-suppliers':
        result = await listSuppliers(apiHeaders, body.search);
        break;

      case 'find-products':
        result = await findProductsByName(apiHeaders, body.nameFilter || 'Cam Estofada');
        break;

      case 'update-product': {
        if (!body.productId || !body.fornecedorId) {
          throw new Error('productId e fornecedorId são obrigatórios');
        }
        const prodUrl = `https://api.gestaoclick.com/api/produtos/${body.productId}`;
        const prodResp = await fetchWithRetry(prodUrl, { method: 'GET', headers: apiHeaders });
        const prodJson = await prodResp.json();
        const prodData = prodJson?.data || prodJson;
        result = await updateProductSupplier(apiHeaders, body.productId, body.fornecedorId, prodData);
        break;
      }

      case 'test-fields':
        result = await testSupplierFields(apiHeaders, body.productId || '58325295', body.fornecedorId || '1092154');
        break;

      case 'bulk-update':
        result = await bulkUpdateSupplier(
          apiHeaders,
          body.nameFilter || 'Cam Estofada',
          body.supplierName || 'UP Fábrica',
          body.dryRun !== false,
          body.offset || 0,
          body.limit || 30
        );
        break;

      case 'get-sale': {
        const codigo = body.vendaCodigo;
        if (!codigo) throw new Error('vendaCodigo é obrigatório');
        
        let saleId: string | null = null;
        let saleData: any = null;
        let pg = 1;
        while (pg <= 50 && !saleId) {
          const url = `https://api.gestaoclick.com/api/vendas?pagina=${pg}`;
          const resp = await fetchWithRetry(url, { method: 'GET', headers: apiHeaders });
          const data = await resp.json();
          const vendas = data?.data || [];
          const found = vendas.find((v: any) => String(v.codigo) === String(codigo));
          if (found) { saleId = found.id; saleData = found; }
          const totalPages = data?.meta?.total_paginas || 1;
          if (pg >= totalPages) break;
          pg++;
        }
        
        if (!saleId) {
          result = { error: `Venda #${codigo} não encontrada na listagem` };
          break;
        }
        
        // Get full details
        const detailResp = await fetchWithRetry(`https://api.gestaoclick.com/api/vendas/${saleId}`, {
          method: 'GET', headers: apiHeaders,
        });
        const detailData = await detailResp.json();
        result = { listing: saleData, detail: detailData?.data || detailData };
        break;
      }

      case 'update-sale-status': {
        const vendaCodigo = body.vendaCodigo;
        const novaSituacaoId = body.situacao;
        if (!vendaCodigo || !novaSituacaoId) {
          throw new Error('vendaCodigo e situacao são obrigatórios');
        }

        // Step 1: Find the sale by codigo
        let vendaId: string | null = null;
        let vendaOriginal: any = null;
        let page = 1;
        while (page <= 50 && !vendaId) {
          const url = `https://api.gestaoclick.com/api/vendas?pagina=${page}`;
          const resp = await fetchWithRetry(url, { method: 'GET', headers: apiHeaders });
          const data = await resp.json();
          const vendas = data?.data || [];
          const found = vendas.find((v: any) => String(v.codigo) === String(vendaCodigo));
          if (found) {
            vendaId = found.id;
            vendaOriginal = found;
          }
          const totalPages = data?.meta?.total_paginas || 1;
          if (page >= totalPages) break;
          page++;
        }

        if (!vendaId || !vendaOriginal) {
          result = { success: false, error: `Venda #${vendaCodigo} não encontrada` };
          break;
        }

        // Step 2: GET full sale details to preserve all data
        const fullDetailResp = await fetchWithRetry(`https://api.gestaoclick.com/api/vendas/${vendaId}`, {
          method: 'GET', headers: apiHeaders,
        });
        const fullDetailData = await fullDetailResp.json();
        const fullSale = fullDetailData?.data || fullDetailData;

        // Step 3: PUT with all original data + updated situacao_id
        const putUrl = `https://api.gestaoclick.com/api/vendas/${vendaId}`;
        const putPayload = { ...fullSale, situacao_id: novaSituacaoId };
        // Remove read-only/computed fields that might cause issues
        delete putPayload.id;
        delete putPayload.codigo;
        delete putPayload.cadastrado_em;
        delete putPayload.modificado_em;
        delete putPayload.nome_situacao;
        delete putPayload.cor_situacao;
        delete putPayload.nome_cliente;
        delete putPayload.nome_vendedor;
        delete putPayload.nome_forma_pagamento;
        delete putPayload.nome_centro_custo;
        delete putPayload.nome_canal_venda;
        delete putPayload.nome_loja;
        delete putPayload.nome_tecnico;
        delete putPayload.nome_transportadora;
        delete putPayload.hash;
        
        const putResp = await fetchWithRetry(putUrl, {
          method: 'PUT',
          headers: apiHeaders,
          body: JSON.stringify(putPayload),
        });
        const putText = await putResp.text();
        let putData: any;
        try { putData = JSON.parse(putText); } catch { putData = { raw: putText }; }

        // Step 4: Verify
        const verifyResp = await fetchWithRetry(`https://api.gestaoclick.com/api/vendas/${vendaId}`, {
          method: 'GET', headers: apiHeaders,
        });
        const verifyData = await verifyResp.json();
        const vendaDepois = verifyData?.data || verifyData;

        result = {
          success: putResp.ok,
          venda_codigo: vendaCodigo,
          venda_id: vendaId,
          situacao_antes: vendaOriginal.nome_situacao || vendaOriginal.situacao,
          situacao_depois: vendaDepois?.nome_situacao || 'N/A',
          campo_alterou: (vendaOriginal.nome_situacao || vendaOriginal.situacao) !== (vendaDepois?.nome_situacao || vendaDepois?.situacao),
          put_status: putResp.status,
          put_response_status: putData?.status,
        };
        break;
      }

      default:
        throw new Error(`Action desconhecida: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
