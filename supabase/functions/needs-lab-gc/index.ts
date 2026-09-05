// MÓDULO EXPERIMENTAL REMOVÍVEL — "Necessidades de Compra — Testes"
// SOMENTE LEITURA. Não cria, não altera e não apaga nada no GestãoClick nem no Contagem.
// Remoção: apagar esta pasta (supabase/functions/needs-lab-gc). Nada mais depende dela.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const API = 'https://api.gestaoclick.com/api';
const MAX_RPS = 3; // limite global deste fluxo
const MIN_INTERVAL_MS = Math.ceil(1000 / MAX_RPS);

// ---------- throttle global (sequencial) ----------
let lastCallAt = 0;
async function throttle() {
  const now = Date.now();
  const wait = lastCallAt + MIN_INTERVAL_MS - now;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallAt = Date.now();
}

type Json = Record<string, unknown>;

async function gcFetch(url: string, headers: Record<string, string>, maxRetries = 3): Promise<Response> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    await throttle();
    let res: Response;
    try {
      res = await fetch(url, { method: 'GET', headers });
    } catch (e) {
      if (attempt === maxRetries) throw e;
      await new Promise((r) => setTimeout(r, attempt * 1200));
      continue;
    }
    if (res.status === 429 || res.status === 503) {
      const retryAfter = Number(res.headers.get('retry-after') ?? 0);
      await res.text();
      const waitMs = retryAfter > 0 ? retryAfter * 1000 : attempt * 2000;
      if (attempt === maxRetries) throw new Error(`GestãoClick ${res.status} (limite de pedidos) após ${attempt} tentativas`);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    return res;
  }
  throw new Error('Tentativas esgotadas');
}

async function gcJson(url: string, headers: Record<string, string>): Promise<Json> {
  const res = await gcFetch(url, headers);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`GestãoClick [${res.status}] ${url}: ${txt.slice(0, 300)}`);
  }
  return (await res.json()) as Json;
}

function str(v: unknown): string {
  return String(v ?? '').trim();
}
function num(v: unknown): number {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}
function isoDate(v: unknown): string {
  const s = str(v);
  if (!s) return '';
  if (s.includes('/')) {
    const p = s.split('/');
    if (p.length === 3) return `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
  }
  return s.slice(0, 10);
}

// deno-lint-ignore no-explicit-any
function unwrap(row: any, keys: string[]): any {
  if (!row || typeof row !== 'object') return row;
  for (const k of keys) if (k in row && row[k] && typeof row[k] === 'object') return row[k];
  return row;
}

// deno-lint-ignore no-explicit-any
function lineRefs(item: any) {
  const p = item?.produto ?? {};
  const codigo =
    [item?.codigo_interno, item?.codigo, p?.codigo_interno, p?.codigo, p?.referencia]
      .map(str)
      .find((v) => v !== '') ?? '';
  const produtoId = [item?.produto_id, p?.produto_id, p?.id].map(str).find((v) => v !== '') ?? '';
  const variacaoId =
    [item?.variacao_id, item?.variacao?.id, p?.variacao_id, p?.variacao?.id].map(str).find((v) => v !== '') ?? '';
  const nome = [item?.nome, p?.nome_produto, p?.nome].map(str).find((v) => v !== '') ?? '';
  const detalhes = [item?.detalhes, item?.observacoes, item?.descricao, p?.detalhes].map(str).find((v) => v !== '') ?? '';
  return { codigo, produtoId, variacaoId, nome, detalhes };
}

// deno-lint-ignore no-explicit-any
function itemsOf(doc: any): any[] {
  const raw = doc?.produtos ?? doc?.itens ?? doc?.produto ?? [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr.map((r) => unwrap(r, ['produto', 'Produto', 'item', 'Item'])).filter(Boolean);
}

async function fetchAllPages(
  path: string,
  headers: Record<string, string>,
  quality: { errors: string[]; notes: string[] },
  maxPages: number,
  // deno-lint-ignore no-explicit-any
): Promise<{ rows: any[]; pagesRead: number; totalPages: number; complete: boolean }> {
  // deno-lint-ignore no-explicit-any
  const rows: any[] = [];
  let page = 1;
  let totalPages = 1;
  let complete = true;
  while (page <= maxPages) {
    let body: Json;
    try {
      body = await gcJson(`${API}${path}?pagina=${page}`, headers);
    } catch (e) {
      quality.errors.push(`${path} página ${page}: ${(e as Error).message}`);
      complete = false;
      break;
    }
    // deno-lint-ignore no-explicit-any
    const data = ((body as any)?.data ?? []) as any[];
    // deno-lint-ignore no-explicit-any
    const meta = ((body as any)?.meta ?? {}) as any;
    totalPages = Number(meta?.total_paginas ?? totalPages) || totalPages;
    rows.push(...data);
    const proxima = meta?.proxima_pagina;
    const hasNext =
      (proxima !== undefined && proxima !== null && str(proxima) !== '' && str(proxima) !== '0') ||
      (Number.isFinite(Number(meta?.total_paginas)) && page < Number(meta.total_paginas));
    if (!hasNext || data.length === 0) break;
    page += 1;
  }
  if (page > maxPages) {
    complete = false;
    quality.notes.push(`${path}: leitura interrompida no limite de ${maxPages} páginas (total indicado: ${totalPages}).`);
  }
  return { rows, pagesRead: Math.min(page, maxPages), totalPages, complete };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Não autenticado' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await authClient.auth.getUser();
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: 'Não autenticado' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const { data: isAdmin } = await authClient.rpc('has_role', { _user_id: userData.user.id, _role: 'admin' });
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: 'Apenas administradores' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const accessToken = Deno.env.get('GESTAOCLICK_ACCESS_TOKEN');
    const secretToken = Deno.env.get('GESTAOCLICK_SECRET_ACCESS_TOKEN');
    if (!accessToken || !secretToken) throw new Error('Credenciais GestãoClick não configuradas');
    const headers = {
      'access-token': accessToken,
      'secret-access-token': secretToken,
      'Content-Type': 'application/json',
    };

    const body = (await req.json().catch(() => ({}))) as Json;
    const action = str(body.action) || 'situacoes';

    if (action === 'situacoes') {
      const quality = { errors: [] as string[], notes: [] as string[] };
      const load = async (p: string) => {
        try {
          const j = await gcJson(`${API}${p}`, headers);
          // deno-lint-ignore no-explicit-any
          return (((j as any)?.data ?? []) as any[]).map((s) => ({ id: str(s.id), nome: str(s.nome) }));
        } catch (e) {
          quality.errors.push(`${p}: ${(e as Error).message}`);
          return [];
        }
      };
      const [vendas, compras] = [await load('/situacoes_vendas'), await load('/situacoes_compras')];
      return new Response(JSON.stringify({ situacoesVendas: vendas, situacoesCompras: compras, quality }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'snapshot') {
      const vendaSituacaoIds = new Set((Array.isArray(body.vendaSituacaoIds) ? body.vendaSituacaoIds : []).map(str));
      const compraSituacaoIds = new Set((Array.isArray(body.compraSituacaoIds) ? body.compraSituacaoIds : []).map(str));
      const maxVendaPages = Number(body.maxVendaPages ?? 60);
      const maxCompraPages = Number(body.maxCompraPages ?? 30);
      const maxCompraDetails = Number(body.maxCompraDetails ?? 80);

      const quality = { errors: [] as string[], notes: [] as string[] };

      // Nomes de situações (para etiquetar)
      const situacaoNome: Record<string, string> = {};
      const situacaoCompraNome: Record<string, string> = {};
      try {
        const j = await gcJson(`${API}/situacoes_vendas`, headers);
        // deno-lint-ignore no-explicit-any
        for (const s of (((j as any)?.data ?? []) as any[])) situacaoNome[str(s.id)] = str(s.nome);
      } catch (e) {
        quality.errors.push(`situacoes_vendas: ${(e as Error).message}`);
      }
      try {
        const j = await gcJson(`${API}/situacoes_compras`, headers);
        // deno-lint-ignore no-explicit-any
        for (const s of (((j as any)?.data ?? []) as any[])) situacaoCompraNome[str(s.id)] = str(s.nome);
      } catch (e) {
        quality.notes.push(`situacoes_compras indisponível: ${(e as Error).message}`);
      }

      // ---- VENDAS ----
      const vendasRes = await fetchAllPages('/vendas', headers, quality, maxVendaPages);
      const vendas: unknown[] = [];
      let vendasSemLinhas = 0;
      for (const rawRow of vendasRes.rows) {
        const v = unwrap(rawRow, ['Venda', 'venda']);
        const sitId = str(v?.situacao_id);
        if (vendaSituacaoIds.size > 0 && !vendaSituacaoIds.has(sitId)) continue;
        const linhas = itemsOf(v).map((item, idx) => {
          const refs = lineRefs(item);
          return {
            posicao: idx,
            ...refs,
            quantidade: num(item?.quantidade),
          };
        });
        if (linhas.length === 0) vendasSemLinhas += 1;
        vendas.push({
          id: str(v?.id),
          codigo: str(v?.codigo),
          data: isoDate(v?.data ?? v?.data_venda),
          dataEntrega: isoDate(v?.data_entrega ?? v?.previsao_entrega ?? ''),
          situacaoId: sitId,
          situacaoNome: situacaoNome[sitId] ?? '',
          cliente: str(v?.nome_cliente ?? v?.cliente_nome ?? v?.razao_social),
          linhas,
        });
      }
      if (vendasSemLinhas > 0) {
        quality.notes.push(
          `${vendasSemLinhas} venda(s) sem linhas de produto na listagem — não são contadas como procura (evita zeros inventados).`,
        );
      }

      // ---- COMPRAS ----
      const comprasRes = await fetchAllPages('/compras', headers, quality, maxCompraPages);
      const comprasFiltradas = comprasRes.rows
        .map((r) => unwrap(r, ['Compra', 'compra']))
        .filter((c) => compraSituacaoIds.size === 0 || compraSituacaoIds.has(str(c?.situacao_id)));

      const compras: unknown[] = [];
      let detalhesLidos = 0;
      let detalhesEmFalta = 0;
      for (const c of comprasFiltradas) {
        let doc = c;
        let linhas = itemsOf(doc);
        if (linhas.length === 0 && str(c?.id)) {
          if (detalhesLidos < maxCompraDetails) {
            try {
              const j = await gcJson(`${API}/compras/${str(c.id)}`, headers);
              // deno-lint-ignore no-explicit-any
              const raw = (j as any)?.data ?? j;
              doc = unwrap(Array.isArray(raw) ? raw[0] : raw, ['Compra', 'compra']);
              linhas = itemsOf(doc);
              detalhesLidos += 1;
            } catch (e) {
              quality.errors.push(`compra ${str(c.id)}: ${(e as Error).message}`);
              detalhesEmFalta += 1;
            }
          } else {
            detalhesEmFalta += 1;
          }
        }
        const sitId = str(c?.situacao_id);
        compras.push({
          id: str(c?.id),
          codigo: str(c?.codigo ?? c?.numero ?? c?.numero_documento),
          data: isoDate(c?.data ?? c?.data_compra),
          previsao: isoDate(c?.previsao_entrega ?? c?.data_entrega ?? ''),
          situacaoId: sitId,
          situacaoNome: situacaoCompraNome[sitId] ?? '',
          fornecedor: str(c?.nome_fornecedor ?? c?.fornecedor_nome ?? c?.razao_social),
          linhasIndisponiveis: linhas.length === 0,
          linhas: linhas.map((item, idx) => {
            const refs = lineRefs(item);
            return {
              posicao: idx,
              ...refs,
              quantidade: num(item?.quantidade),
              // Semântica NÃO CONFIRMADA — devolvida em bruto, nunca interpretada como recebido.
              quantidadeSaidaBruta: item?.quantidade_saida === undefined ? null : num(item?.quantidade_saida),
            };
          }),
        });
      }
      if (detalhesEmFalta > 0) {
        quality.notes.push(
          `${detalhesEmFalta} compra(s) sem linhas legíveis (limite de detalhes ou erro). Ficam marcadas para revisão manual.`,
        );
      }

      const complete = vendasRes.complete && comprasRes.complete && quality.errors.length === 0 && detalhesEmFalta === 0;

      return new Response(
        JSON.stringify({
          generatedAt: new Date().toISOString(),
          vendas,
          compras,
          quality: {
            ...quality,
            complete,
            vendasPaginasLidas: vendasRes.pagesRead,
            vendasPaginasTotal: vendasRes.totalPages,
            comprasPaginasLidas: comprasRes.pagesRead,
            comprasPaginasTotal: comprasRes.totalPages,
            comprasDetalhesLidos: detalhesLidos,
            comprasDetalhesEmFalta: detalhesEmFalta,
            quantidadeSaidaConfirmada: false,
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(JSON.stringify({ error: `Ação desconhecida: ${action}` }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
