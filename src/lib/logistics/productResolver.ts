import { supabase } from '@/integrations/supabase/client';
import { normalizeText, normalizeLoose, extractEmbeddedCode } from '@/lib/stock/pickingImport';

const PAGE = 1000;

export interface ResolverProduct {
  id: string;
  code: string;
  name: string;
  supplier_code: string | null;
}

export interface ProductResolver {
  /** Devolve o id do produto a partir do código e/ou nome (com fallbacks). */
  resolve(code: string | null | undefined, name?: string | null): string | null;
  products: ResolverProduct[];
}

function codeKey(v: string | null | undefined) {
  return normalizeText(v ?? '').replace(/\s+/g, '');
}

/** Carrega todos os produtos e cria um índice por código, código de fornecedor e nome. */
export async function loadProductResolver(): Promise<ProductResolver> {
  const products: ResolverProduct[] = [];
  let offset = 0;
  for (;;) {
    const { data } = await supabase
      .from('products')
      .select('id, code, name, supplier_code')
      .order('code', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1);
    const rows = (data ?? []) as ResolverProduct[];
    products.push(...rows);
    if (rows.length < PAGE) break;
    offset += PAGE;
  }

  const byCode = new Map<string, string>();
  const byName = new Map<string, string[]>();
  const byLoose = new Map<string, string[]>();

  for (const p of products) {
    const c = codeKey(p.code);
    if (c && !byCode.has(c)) byCode.set(c, p.id);
    const sc = codeKey(p.supplier_code);
    if (sc && !byCode.has(sc)) byCode.set(sc, p.id);
    // código embutido no nome (ex.: "... - 2497BM26")
    const emb = codeKey(extractEmbeddedCode(p.name));
    if (emb && !byCode.has(emb)) byCode.set(emb, p.id);

    const n = normalizeText(p.name);
    if (n) byName.set(n, [...(byName.get(n) ?? []), p.id]);
    const l = normalizeLoose(p.name);
    if (l) byLoose.set(l, [...(byLoose.get(l) ?? []), p.id]);
  }

  const resolve = (code: string | null | undefined, name?: string | null): string | null => {
    const c = codeKey(code);
    if (c && byCode.has(c)) return byCode.get(c)!;

    const embedded = codeKey(extractEmbeddedCode(name ?? ''));
    if (embedded && byCode.has(embedded)) return byCode.get(embedded)!;

    const n = normalizeText(name ?? '');
    if (n) {
      const exact = byName.get(n);
      if (exact?.length === 1) return exact[0];
      const l = normalizeLoose(name ?? '');
      const loose = l ? byLoose.get(l) : undefined;
      if (loose?.length === 1) return loose[0];
      if (n.length >= 8) {
        const partial = products.filter((p) => {
          const pn = normalizeText(p.name);
          return pn.includes(n) || n.includes(pn);
        });
        if (partial.length === 1) return partial[0].id;
      }
    }
    return null;
  };

  return { resolve, products };
}
