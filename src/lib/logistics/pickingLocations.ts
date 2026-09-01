import { supabase } from '@/integrations/supabase/client';
import { loadProductResolver } from './productResolver';
import type { PickingLine } from './picking';
import type { BulkLabelProduct } from '@/components/products/BulkLabelPrintButton';

const PAGE = 1000;

/**
 * Resolve cada linha de picking ao produto do Contagem e devolve, por chave de
 * linha, os dados necessários para imprimir etiquetas (código, nome, colis, stock).
 */
export async function resolvePickingLabelProducts(
  lines: PickingLine[],
): Promise<Map<string, BulkLabelProduct>> {
  const result = new Map<string, BulkLabelProduct>();
  if (lines.length === 0) return result;

  const resolver = await loadProductResolver();
  const idByLine = new Map<string, string>();
  for (const line of lines) {
    const id = resolver.resolve(line.codigo, line.nome);
    if (id) idByLine.set(line.key, id);
  }
  const ids = [...new Set(idByLine.values())];
  if (ids.length === 0) return result;

  const byId = new Map<string, BulkLabelProduct>();
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data } = await supabase
      .from('products')
      .select('id, code, name, total_colis, current_stock')
      .in('id', chunk);
    for (const p of (data ?? []) as (BulkLabelProduct & { id: string })[]) {
      byId.set(p.id, { code: p.code, name: p.name, total_colis: p.total_colis, current_stock: p.current_stock });
    }
  }

  for (const [key, id] of idByLine) {
    const prod = byId.get(id);
    if (prod) result.set(key, prod);
  }
  return result;
}

/**
 * Procura, para cada linha de picking, as localizações no armazém onde o
 * produto tem stock (soma de todos os colis por localização).
 */
export async function attachPickingLocations(lines: PickingLine[]): Promise<PickingLine[]> {
  if (lines.length === 0) return lines;

  const resolver = await loadProductResolver();
  const idByLine = new Map<string, string>();
  for (const line of lines) {
    const id = resolver.resolve(line.codigo, line.nome);
    if (id) idByLine.set(line.key, id);
  }

  const ids = [...new Set(idByLine.values())];
  if (ids.length === 0) return lines.map((l) => ({ ...l, localizacoes: '—', stock: undefined }));

  const counts: { product_id: string; location: string | null; quantity: number }[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    let offset = 0;
    for (;;) {
      const { data } = await supabase
        .from('counts')
        .select('product_id, location, quantity')
        .in('product_id', chunk)
        .order('id', { ascending: true })
        .range(offset, offset + PAGE - 1);
      const rows = (data ?? []) as typeof counts;
      counts.push(...rows);
      if (rows.length < PAGE) break;
      offset += PAGE;
    }
  }

  const byProduct = new Map<string, Map<string, number>>();
  for (const c of counts) {
    if (!c.quantity || c.quantity <= 0) continue;
    const loc = (c.location ?? '').trim() || 'Sem localização';
    const map = byProduct.get(c.product_id) ?? new Map<string, number>();
    map.set(loc, (map.get(loc) ?? 0) + c.quantity);
    byProduct.set(c.product_id, map);
  }

  return lines.map((line) => {
    const id = idByLine.get(line.key);
    const map = id ? byProduct.get(id) : undefined;
    if (!map || map.size === 0) return { ...line, localizacoes: '—', stock: id ? 0 : undefined };
    const stock = [...map.values()].reduce((s, q) => s + q, 0);
    const localizacoes = [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'pt', { numeric: true }))
      .map(([loc, qty]) => `${loc} (${qty})`)
      .join(', ');
    return { ...line, localizacoes, stock };
  });
}
