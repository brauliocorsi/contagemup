// Camada de acesso à Gestão Click usada pelos módulos de Logística
// (notas de separação, guias de transporte e otimização de rotas).

export type SepProduct = {
  codigo: string;
  nome: string;
  quantidade: string;
  detalhes: string;
};

export type SepService = {
  nome: string;
  valor: number;
  tipo: "entrega" | "montagem" | "outro";
};

export type SepOrder = {
  id: string;
  codigo: string;
  cliente: string;
  vendedor: string;
  data: string;
  entrega: string;
  situacao: string;
  transportadora: string;
  observacoes: string;
  morada: string;
  total: string;
  produtos: SepProduct[];
  servicos: SepService[];
  valorEntrega: number;
  valorMontagem: number;
  valorServicos: number;
};

export type GcLine = {
  codigo: string;
  nome: string;
  detalhes: string;
  unidade: string;
  quantidade: string;
  valorUnitario: string;
  desconto: string;
  total: string;
};

export type GcDocument = {
  id: string;
  codigo: string;
  data: string;
  entrega: string;
  validade: string;
  situacao: string;
  loja: string;
  centroCusto: string;
  canalVenda: string;
  vendedor: string;
  transportadora: string;
  condicaoPagamento: string;
  introducao: string;
  observacoes: string;
  observacoesInternas: string;
  cliente: {
    id: string;
    nome: string;
    documento: string;
    email: string;
    telefone: string;
    morada: string;
  };
  produtos: GcLine[];
  servicos: GcLine[];
  pagamentos: { vencimento: string; forma: string; valor: string; observacao: string }[];
  atributos: { descricao: string; conteudo: string }[];
  valorProdutos: string;
  valorServicos: string;
  valorFrete: string;
  desconto: string;
  valorTotal: string;
};

const API = "https://api.gestaoclick.com";
const PAGE_SIZE = 100;
const MAX_PAGES = 25;

type Dict = Record<string, unknown>;

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

function headers(): Record<string, string> {
  const accessToken = Deno.env.get("GESTAOCLICK_ACCESS_TOKEN");
  const secretToken = Deno.env.get("GESTAOCLICK_SECRET_ACCESS_TOKEN");
  if (!accessToken || !secretToken) throw new Error("Credenciais da Gestão Click em falta");
  return {
    "access-token": accessToken,
    "secret-access-token": secretToken,
    Accept: "application/json",
  };
}

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: headers() });
  if (!res.ok) throw new Error(`Gestão Click respondeu ${res.status}`);
  return (await res.json()) as T;
}

function unwrap(list: unknown, key: string): Dict[] {
  return (Array.isArray(list) ? list : [])
    .map((entry) => (entry as Record<string, Dict | undefined>)[key] ?? {})
    .filter((entry) => Object.keys(entry).length > 0);
}

function serviceType(nome: string): SepService["tipo"] {
  const key = nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/montag|monta|instala/.test(key)) return "montagem";
  if (/entrega|transporte|porte|frete|distribuic/.test(key)) return "entrega";
  return "outro";
}

function money(value: unknown): number {
  const raw = typeof value === "number" ? String(value) : String(value ?? "");
  const clean = raw.replace(/[^\d,.-]/g, "");
  const normalized =
    clean.includes(",") && clean.lastIndexOf(",") > clean.lastIndexOf(".")
      ? clean.replace(/\./g, "").replace(",", ".")
      : clean.replace(/,/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function serviceTotals(item: Dict): {
  servicos: SepService[];
  valorEntrega: number;
  valorMontagem: number;
  valorServicos: number;
} {
  const servicos: SepService[] = unwrap(item["servicos"], "servico").map((s) => {
    const nome = str(s["nome_servico"]) || str(s["nome"]) || "Serviço";
    const valor = money(s["valor_total"] ?? s["valor_venda"]);
    return { nome, valor, tipo: serviceType(nome) };
  });
  const soma = (tipo: SepService["tipo"]) =>
    Math.round(servicos.filter((s) => s.tipo === tipo).reduce((a, s) => a + s.valor, 0) * 100) / 100;
  const total = servicos.reduce((a, s) => a + s.valor, 0);
  return {
    servicos,
    valorEntrega: soma("entrega"),
    valorMontagem: soma("montagem"),
    valorServicos: Math.round((total || money(item["valor_servicos"])) * 100) / 100,
  };
}

/** Junta os campos de morada da Gestão Click numa linha única e limpa. */
function formatAddress(e: Dict): string {
  const parts = [
    str(e["logradouro"]),
    str(e["numero"]),
    str(e["complemento"]),
    str(e["bairro"]),
    str(e["cep"]),
    str(e["nome_cidade"]),
    str(e["estado"]),
  ];

  const seen = new Set<string>();
  const clean: string[] = [];
  for (const raw of parts) {
    const value = raw.replace(/\s+/g, " ").trim().replace(/[,;]+$/, "");
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    if (clean.some((c) => c.toLowerCase().includes(key))) continue;
    seen.add(key);
    clean.push(value);
  }

  if (clean.length === 0) return "";
  const joined = clean.join(", ");
  return /portugal/i.test(joined) ? joined : `${joined}, Portugal`;
}

function addressOf(item: Dict): string {
  return unwrap(item["enderecos"], "endereco").map(formatAddress).find((v) => v.length > 0) ?? "";
}

const clientAddressCache = new Map<string, Promise<string>>();

function clientAddress(clienteId: string): Promise<string> {
  const cached = clientAddressCache.get(clienteId);
  if (cached) return cached;
  const p = api<{ data?: Dict }>(`/clientes/${clienteId}`)
    .then((res) => addressOf(res.data ?? {}))
    .catch(() => "");
  clientAddressCache.set(clienteId, p);
  return p;
}

async function fillAddresses(orders: (SepOrder & { clienteId?: string })[]): Promise<void> {
  const pending = orders.filter((o) => !o.morada && o.clienteId);
  const batch = 6;
  for (let i = 0; i < pending.length; i += batch) {
    const slice = pending.slice(i, i + batch);
    const results = await Promise.all(slice.map((o) => clientAddress(o.clienteId!)));
    slice.forEach((o, idx) => {
      o.morada = results[idx] ?? "";
    });
  }
}

function codeOf(p: Dict): string {
  return (
    str(p["codigo"]) ||
    str(p["codigo_interno"]) ||
    str(p["codigo_produto"]) ||
    str(p["codigo_barra"]) ||
    ""
  );
}

const codeCache = new Map<string, Promise<Record<string, string>>>();

function productCodes(produtoId: string): Promise<Record<string, string>> {
  const cached = codeCache.get(produtoId);
  if (cached) return cached;
  const p = api<{ data?: Dict }>(`/produtos/${produtoId}`)
    .then((res) => {
      const data = res.data ?? {};
      const base = codeOf(data);
      const map: Record<string, string> = { "": base };
      for (const v of unwrap(data["variacoes"], "variacao")) {
        map[str(v["id"])] = str(v["codigo"]) || base;
      }
      return map;
    })
    .catch(() => ({ "": "" }) as Record<string, string>);
  codeCache.set(produtoId, p);
  return p;
}

async function resolveCodes<T extends { codigo: string; produtoId: string; variacaoId: string }>(
  lines: T[],
): Promise<T[]> {
  const ids = [...new Set(lines.filter((l) => !l.codigo && l.produtoId).map((l) => l.produtoId))];
  const entries = await Promise.all(ids.map(async (id) => [id, await productCodes(id)] as const));
  const byId = new Map(entries);
  return lines.map((l) => {
    if (l.codigo || !l.produtoId) return l;
    const map = byId.get(l.produtoId);
    return { ...l, codigo: (map && (map[l.variacaoId] || map[""])) || "" };
  });
}

export async function listOrders(
  from: string,
  to: string,
  lookbackDays: number,
): Promise<{ orders: SepOrder[]; scanned: number; truncated: boolean }> {
  const lookback = Math.min(Math.max(lookbackDays, 1), 730);
  const start = addDays(from, -lookback);

  const get = (page: number) =>
    api<{ meta?: { total_paginas?: number | null }; data?: unknown[] }>(
      `/vendas?limite=${PAGE_SIZE}&pagina=${page}&data_inicio=${start}&data_fim=${to}`,
    );

  const first = await get(1);
  const totalPages = Math.max(1, Number(first.meta?.total_paginas ?? 1));
  const pages = Math.min(totalPages, MAX_PAGES);
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, pages - 1) }, (_, i) => get(i + 2).catch(() => ({ data: [] }))),
  );
  const raw = [first, ...rest].flatMap((p) => (Array.isArray(p.data) ? p.data : []));

  const orders: (SepOrder & { clienteId?: string })[] = [];
  for (const item of raw as Dict[]) {
    const entrega = str(item["prazo_entrega"]);
    if (!entrega || entrega < from || entrega > to) continue;

    const produtos = unwrap(item["produtos"], "produto")
      .map((p) => ({
        codigo: codeOf(p),
        produtoId: str(p["produto_id"]),
        variacaoId: str(p["variacao_id"]),
        nome: str(p["nome_produto"]),
        quantidade: str(p["quantidade"]) || "1",
        detalhes: str(p["detalhes"]),
      }))
      .filter((p) => p.nome.length > 0) as (SepProduct & { produtoId: string; variacaoId: string })[];

    orders.push({
      id: str(item["id"]),
      codigo: str(item["codigo"]),
      cliente: str(item["nome_cliente"]),
      vendedor: str(item["nome_vendedor"]),
      data: str(item["data"]),
      entrega,
      situacao: str(item["nome_situacao"]),
      transportadora: str(item["nome_transportadora"]),
      observacoes: str(item["observacoes_interna"]),
      morada: addressOf(item),
      total: str(item["valor_total"]),
      produtos,
      ...serviceTotals(item),
      clienteId: str(item["cliente_id"]),
    });
  }

  await fillAddresses(orders);
  for (const o of orders) delete (o as { clienteId?: string }).clienteId;

  const resolved = await resolveCodes(
    orders.flatMap((o) => o.produtos as (SepProduct & { produtoId: string; variacaoId: string })[]),
  );
  let cursor = 0;
  for (const o of orders) o.produtos = resolved.slice(cursor, (cursor += o.produtos.length));

  orders.sort((a, b) =>
    a.entrega === b.entrega ? a.codigo.localeCompare(b.codigo) : a.entrega.localeCompare(b.entrega),
  );
  return { orders, scanned: raw.length, truncated: totalPages > pages };
}

/** Procura encomendas pelo código público (nº de encomenda), percorrendo páginas de /vendas. */
export async function findOrdersByCode(
  codes: string[],
): Promise<{ orders: SepOrder[]; notFound: string[] }> {
  const wanted = new Set(codes.map((c) => c.trim()).filter(Boolean));
  if (wanted.size === 0) return { orders: [], notFound: [] };

  const found: (SepOrder & { clienteId?: string })[] = [];
  const MAX_SEARCH_PAGES = 50;

  for (let page = 1; page <= MAX_SEARCH_PAGES && wanted.size > 0; page++) {
    const res = await api<{ meta?: { total_paginas?: number | null }; data?: unknown[] }>(
      `/vendas?limite=${PAGE_SIZE}&pagina=${page}`,
    ).catch(() => ({ data: [] as unknown[] }));
    const rows = (Array.isArray(res.data) ? res.data : []) as Dict[];
    if (rows.length === 0) break;

    for (const item of rows) {
      const codigo = str(item["codigo"]);
      if (!wanted.has(codigo)) continue;
      wanted.delete(codigo);

      const produtos = unwrap(item["produtos"], "produto")
        .map((p) => ({
          codigo: codeOf(p),
          produtoId: str(p["produto_id"]),
          variacaoId: str(p["variacao_id"]),
          nome: str(p["nome_produto"]),
          quantidade: str(p["quantidade"]) || "1",
          detalhes: str(p["detalhes"]),
        }))
        .filter((p) => p.nome.length > 0) as (SepProduct & {
        produtoId: string;
        variacaoId: string;
      })[];

      found.push({
        id: str(item["id"]),
        codigo,
        cliente: str(item["nome_cliente"]),
        vendedor: str(item["nome_vendedor"]),
        data: str(item["data"]),
        entrega: str(item["prazo_entrega"]),
        situacao: str(item["nome_situacao"]),
        transportadora: str(item["nome_transportadora"]),
        observacoes: str(item["observacoes_interna"]),
        morada: addressOf(item),
        total: str(item["valor_total"]),
        produtos,
        ...serviceTotals(item),
        clienteId: str(item["cliente_id"]),
      });
    }

    const totalPages = Math.max(1, Number(res.meta?.total_paginas ?? 1));
    if (page >= totalPages) break;
  }

  await fillAddresses(found);
  for (const o of found) delete (o as { clienteId?: string }).clienteId;

  const resolved = await resolveCodes(
    found.flatMap((o) => o.produtos as (SepProduct & { produtoId: string; variacaoId: string })[]),
  );
  let cursor = 0;
  for (const o of found) o.produtos = resolved.slice(cursor, (cursor += o.produtos.length));

  return { orders: found, notFound: [...wanted] };
}



function lineItems(list: unknown, key: string, nameField: string) {
  return unwrap(list, key).map((p) => ({
    codigo: codeOf(p),
    produtoId: str(p["produto_id"]),
    variacaoId: str(p["variacao_id"]),
    nome: str(p[nameField]),
    detalhes: str(p["detalhes"]),
    unidade: str(p["sigla_unidade"]),
    quantidade: str(p["quantidade"]) || "1",
    valorUnitario: str(p["valor_venda"]),
    desconto: str(p["desconto_valor"]),
    total: str(p["valor_total"]),
  }));
}

export async function fetchDocument(id: string): Promise<GcDocument> {
  const venda = (await api<{ data?: Dict }>(`/vendas/${id}`)).data ?? {};

  let cliente: Dict = {};
  const clienteId = str(venda["cliente_id"]);
  if (clienteId) {
    cliente = (await api<{ data?: Dict }>(`/clientes/${clienteId}`).catch(() => ({ data: {} }))).data ?? {};
  }

  const clienteMorada = addressOf(venda) || addressOf(cliente);

  return {
    id: str(venda["id"]),
    codigo: str(venda["codigo"]),
    data: str(venda["data"]),
    entrega: str(venda["prazo_entrega"]),
    validade: str(venda["validade"]),
    situacao: str(venda["nome_situacao"]),
    loja: str(venda["nome_loja"]),
    centroCusto: str(venda["nome_centro_custo"]),
    canalVenda: str(venda["nome_canal_venda"]),
    vendedor: str(venda["nome_vendedor"]),
    transportadora: str(venda["nome_transportadora"]),
    condicaoPagamento: str(venda["condicao_pagamento"]),
    introducao: str(venda["introducao"]),
    observacoes: str(venda["observacoes"]),
    observacoesInternas: str(venda["observacoes_interna"]),
    cliente: {
      id: clienteId,
      nome: str(cliente["nome"]) || str(venda["nome_cliente"]),
      documento: str(cliente["cnpj"]) || str(cliente["cpf"]),
      email: str(cliente["email"]),
      telefone: str(cliente["celular"]) || str(cliente["telefone"]),
      morada: clienteMorada,
    },
    produtos: await resolveCodes(lineItems(venda["produtos"], "produto", "nome_produto")),
    servicos: lineItems(venda["servicos"], "servico", "nome_servico"),
    pagamentos: unwrap(venda["pagamentos"], "pagamento").map((p) => ({
      vencimento: str(p["data_vencimento"]),
      forma: str(p["nome_forma_pagamento"]),
      valor: str(p["valor"]),
      observacao: str(p["observacao"]),
    })),
    atributos: unwrap(venda["atributos"], "atributo").map((a) => ({
      descricao: str(a["descricao"]),
      conteudo: str(a["conteudo"]),
    })),
    valorProdutos: str(venda["valor_produtos"]),
    valorServicos: str(venda["valor_servicos"]),
    valorFrete: str(venda["valor_frete"]),
    desconto: str(venda["desconto_valor"]),
    valorTotal: str(venda["valor_total"]),
  };
}
