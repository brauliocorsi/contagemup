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
async function updateProductSupplier(apiHeaders: Record<string, string>, productId: string, fornecedorId: string, productData?: any) {
  const url = `https://api.gestaoclick.com/api/produtos/${productId}`;
  
  // Build update payload - include required fields from existing product data
  const payload: any = { fornecedor_id: fornecedorId };
  if (productData) {
    payload.nome = productData.nome;
    payload.codigo_interno = productData.codigo_interno || productData.codigo;
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
  dryRun: boolean
) {
  // Step 1: Find supplier
  console.log(`Searching for supplier: ${supplierName}`);
  const suppliers = await listSuppliers(apiHeaders, supplierName);
  const supplier = suppliers.find((s: any) => 
    String(s.nome || s.razao_social || '').toLowerCase().includes(supplierName.toLowerCase())
  );

  if (!supplier) {
    return { 
      success: false, 
      error: `Fornecedor "${supplierName}" não encontrado`,
      available_suppliers: suppliers.map((s: any) => ({ 
        id: s.id, 
        nome: s.nome || s.razao_social,
      })).slice(0, 20),
    };
  }

  console.log(`Found supplier: ${supplier.nome || supplier.razao_social} (ID: ${supplier.id})`);

  // Step 2: Find products
  console.log(`Searching for products with: ${nameFilter}`);
  const products = await findProductsByName(apiHeaders, nameFilter);
  
  // Filter: all words in nameFilter must appear in product name
  const filterWords = nameFilter.toLowerCase().split(/\s+/);
  const filtered = products.filter((p: any) => {
    const nome = String(p.nome || '').toLowerCase();
    return filterWords.every(word => nome.includes(word));
  });

  console.log(`Found ${filtered.length} products matching "${nameFilter}"`);

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

  // Step 3: Update each product
  const results: any[] = [];
  let successCount = 0;
  let failCount = 0;

  for (const product of filtered) {
    try {
      const result = await updateProductSupplier(apiHeaders, product.id, supplier.id);
      results.push({
        product_id: product.id,
        nome: product.nome,
        status: result.status,
        ok: result.ok,
        response: result.data,
      });
      if (result.ok) successCount++;
      else failCount++;
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 200));
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
    success_count: successCount,
    fail_count: failCount,
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

      case 'update-product':
        if (!body.productId || !body.fornecedorId) {
          throw new Error('productId e fornecedorId são obrigatórios');
        }
        result = await updateProductSupplier(apiHeaders, body.productId, body.fornecedorId);
        break;

      case 'bulk-update':
        result = await bulkUpdateSupplier(
          apiHeaders,
          body.nameFilter || 'Cam Estofada',
          body.supplierName || 'UP Fábrica',
          body.dryRun !== false // default true for safety
        );
        break;

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
