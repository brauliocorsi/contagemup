import { loadXLSX } from '@/lib/lazyXlsx';
import type { Product } from '@/types/stock';

const COLUMN_ALIASES: Record<'code' | 'name' | 'quantity', string[]> = {
  code: ['codigo', 'code', 'código', 'cod', 'sku', 'ref', 'referencia', 'referência', 'product_code', 'productcode'],
  name: ['nome', 'name', 'produto', 'product', 'description', 'descricao', 'descrição', 'designacao', 'designação'],
  quantity: ['quantidade', 'quantity', 'qty', 'qtd', 'stock', 'qtde', 'quant', 'qnt', 'un', 'unidades'],
};

function detectColumnMapping(headers: string[]) {
  const mapping: { code: string | null; name: string | null; quantity: string | null } = {
    code: null,
    name: null,
    quantity: null,
  };
  const normalized = headers.map((h) => h.toLowerCase().trim());
  (Object.keys(COLUMN_ALIASES) as (keyof typeof COLUMN_ALIASES)[]).forEach((field) => {
    for (const alias of COLUMN_ALIASES[field]) {
      const index = normalized.findIndex((h) => h.includes(alias));
      if (index !== -1 && mapping[field] === null) {
        mapping[field] = headers[index];
        break;
      }
    }
  });
  return mapping;
}

export interface RawPickingRow {
  code: string;
  name: string;
  quantity: number;
  details: string | null;   // "stock" | "encomendar" | null
  orders: string | null;    // Encomendas
  line: number;
}

export type MatchMethod =
  | 'code'
  | 'embedded-code'
  | 'name-exact'
  | 'name-normalized'
  | 'name-partial';

export interface ResolvedRow {
  key: string;
  code: string;
  name: string;
  quantity: number;
  details: string | null;
  orders: string | null;
  lines: number[];
  product: Product | null;
  candidates: Product[];
  method: MatchMethod | null;
  status: 'ready' | 'insufficient' | 'ambiguous' | 'missing';
  available: number;
}

const CODE_ALIASES = ['codigo', 'código', 'code', 'cod', 'sku', 'ref', 'referencia', 'referência', 'ean'];
const NAME_ALIASES = ['produto', 'nome', 'name', 'product', 'descricao', 'descrição'];
const QTY_ALIASES = ['quantidade', 'qtd', 'qty', 'quant', 'unidades'];
const DETAIL_ALIASES = ['detalhes', 'detalhe', 'estado', 'status', 'observacao', 'observação'];
const ORDER_ALIASES = ['encomenda', 'encomendas', 'pedido', 'pedidos', 'venda', 'vendas', 'referencia'];

function findHeader(headers: string[], aliases: string[]): string | null {
  const norm = headers.map(h => normalizeText(h));
  for (const a of aliases) {
    const i = norm.findIndex(h => h === normalizeText(a));
    if (i !== -1) return headers[i];
  }
  for (const a of aliases) {
    const i = norm.findIndex(h => h.includes(normalizeText(a)));
    if (i !== -1) return headers[i];
  }
  return null;
}

export function normalizeText(v: string): string {
  return (v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Removes measures / dimensions so "0,45x0,38x0,34" or "190x140cm" don't block matching. */
export function normalizeLoose(v: string): string {
  return normalizeText(v)
    .replace(/\b\d+([.,]\d+)?\s*(x\s*\d+([.,]\d+)?)+\s*(cm|mm|m)?\b/g, ' ')
    .replace(/\b\d+\s*(cm|mm|m|g|kg)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extracts a trailing code from a product name, e.g. "... - 7832BO" or "... - 5902928875072". */
export function extractEmbeddedCode(name: string): string | null {
  const parts = (name || '').split('-');
  if (parts.length < 2) return null;
  const last = parts[parts.length - 1].trim();
  if (!last) return null;
  if (!/^[A-Za-z0-9._/]{3,20}$/.test(last)) return null;
  if (!/\d/.test(last)) return null;
  return last;
}

export function cleanCell(v: unknown): string {
  return String(v ?? '').replace(/[\t\r\n]/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function parsePickingFile(file: File): Promise<RawPickingRow[]> {
  const XLSX = await loadXLSX();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  if (raw.length === 0) return [];

  const headers = Object.keys(raw[0]);
  const auto = detectColumnMapping(headers);
  const codeCol = findHeader(headers, CODE_ALIASES) ?? auto.code;
  const nameCol = findHeader(headers, NAME_ALIASES) ?? auto.name;
  const qtyCol = findHeader(headers, QTY_ALIASES) ?? auto.quantity;
  const detailCol = findHeader(headers, DETAIL_ALIASES);
  const orderCol = findHeader(headers, ORDER_ALIASES);

  if (!nameCol && !codeCol) {
    throw new Error('Não foi encontrada coluna de código nem de nome no ficheiro.');
  }
  if (!qtyCol) {
    throw new Error('Não foi encontrada coluna de quantidade no ficheiro.');
  }

  const rows: RawPickingRow[] = [];
  raw.forEach((r, idx) => {
    const name = nameCol ? cleanCell(r[nameCol]) : '';
    const code = codeCol ? cleanCell(r[codeCol]) : '';
    const qty = parseInt(String(r[qtyCol!] ?? '').replace(/[^\d-]/g, ''), 10);
    if (!name && !code) return;
    if (!Number.isFinite(qty) || qty <= 0) return;
    rows.push({
      code,
      name,
      quantity: qty,
      details: detailCol ? cleanCell(r[detailCol]).toLowerCase() || null : null,
      orders: orderCol ? cleanCell(r[orderCol]) || null : null,
      line: idx + 2,
    });
  });
  return rows;
}

export function isStockRow(row: RawPickingRow): boolean {
  if (!row.details) return true; // no marker → treat as stock exit
  return row.details.includes('stock');
}

interface ProductIndex {
  byCode: Map<string, Product>;
  byName: Map<string, Product[]>;
  byLoose: Map<string, Product[]>;
  all: Product[];
}

export function buildProductIndex(products: Product[]): ProductIndex {
  const byCode = new Map<string, Product>();
  const byName = new Map<string, Product[]>();
  const byLoose = new Map<string, Product[]>();
  products.forEach(p => {
    const c = normalizeText(p.code).replace(/\s+/g, '');
    if (c && !byCode.has(c)) byCode.set(c, p);
    const n = normalizeText(p.name);
    if (n) byName.set(n, [...(byName.get(n) || []), p]);
    const l = normalizeLoose(p.name);
    if (l) byLoose.set(l, [...(byLoose.get(l) || []), p]);
  });
  return { byCode, byName, byLoose, all: products };
}

function matchRow(row: RawPickingRow, idx: ProductIndex): { product: Product | null; candidates: Product[]; method: MatchMethod | null } {
  // 1. exact code
  const code = normalizeText(row.code).replace(/\s+/g, '');
  if (code) {
    const hit = idx.byCode.get(code);
    if (hit) return { product: hit, candidates: [hit], method: 'code' };
  }

  // 2. code embedded in the name
  const embedded = extractEmbeddedCode(row.name);
  if (embedded) {
    const hit = idx.byCode.get(normalizeText(embedded).replace(/\s+/g, ''));
    if (hit) return { product: hit, candidates: [hit], method: 'embedded-code' };
  }

  // 3. exact normalized name
  const n = normalizeText(row.name);
  const exact = idx.byName.get(n);
  if (exact?.length === 1) return { product: exact[0], candidates: exact, method: 'name-exact' };
  if (exact && exact.length > 1) return { product: null, candidates: exact, method: 'name-exact' };

  // 4. loose normalized name (measures removed)
  const l = normalizeLoose(row.name);
  const loose = l ? idx.byLoose.get(l) : undefined;
  if (loose?.length === 1) return { product: loose[0], candidates: loose, method: 'name-normalized' };
  if (loose && loose.length > 1) return { product: null, candidates: loose, method: 'name-normalized' };

  // 5. strong partial match
  if (n.length >= 8) {
    const partial = idx.all.filter(p => {
      const pn = normalizeText(p.name);
      return pn.includes(n) || n.includes(pn);
    });
    if (partial.length === 1) return { product: partial[0], candidates: partial, method: 'name-partial' };
    if (partial.length > 1) return { product: null, candidates: partial.slice(0, 20), method: 'name-partial' };
  }

  return { product: null, candidates: [], method: null };
}

export function resolveRows(rows: RawPickingRow[], products: Product[]): ResolvedRow[] {
  const idx = buildProductIndex(products);

  // Aggregate duplicate lines (same code+name)
  const groups = new Map<string, RawPickingRow[]>();
  rows.forEach(r => {
    const key = `${normalizeText(r.code)}|${normalizeText(r.name)}`;
    groups.set(key, [...(groups.get(key) || []), r]);
  });

  const out: ResolvedRow[] = [];
  groups.forEach((grp, key) => {
    const base = grp[0];
    const quantity = grp.reduce((s, r) => s + r.quantity, 0);
    const orders = Array.from(new Set(
      grp.flatMap(r => (r.orders || '').split(/[,;]/).map(s => s.trim()).filter(Boolean))
    )).join(', ') || null;

    const { product, candidates, method } = matchRow(base, idx);
    const available = product?.current_stock ?? 0;
    let status: ResolvedRow['status'];
    if (!product && candidates.length > 1) status = 'ambiguous';
    else if (!product) status = 'missing';
    else if (available < quantity) status = 'insufficient';
    else status = 'ready';

    out.push({
      key,
      code: base.code,
      name: base.name,
      quantity,
      details: base.details,
      orders,
      lines: grp.map(r => r.line),
      product,
      candidates,
      method,
      status,
      available,
    });
  });

  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function methodLabel(m: MatchMethod | null): string {
  switch (m) {
    case 'code': return 'Código exato';
    case 'embedded-code': return 'Código no nome';
    case 'name-exact': return 'Nome exato';
    case 'name-normalized': return 'Nome normalizado';
    case 'name-partial': return 'Nome parcial';
    default: return 'Sem correspondência';
  }
}
