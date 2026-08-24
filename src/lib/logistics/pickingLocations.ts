import { supabase } from '@/integrations/supabase/client';
import type { PickingLine } from './picking';

const PAGE = 1000;

function norm(v: string | null | undefined): string {
  return (v ?? '').trim().toUpperCase();
}

/**
 * Procura, para cada linha de picking, as localizações no armazém onde o
 * produto tem stock (soma de todos os colis por localização).
 */
export async function attachPickingLocations(lines: PickingLine[]): Promise<PickingLine[]> {
  const codes = [...new Set(lines.map((l) => l.codigo).filter(Boolean))];
  if (codes.length === 0) return lines;

  const products: { id: string; code: string; supplier_code: string | null }[] = [];
  for (let i = 0; i < codes.length; i += 200) {
    const chunk = codes.slice(i, i + 200);
    const { data } = await supabase
      .from('products')
      .select('id, code, supplier_code')
      .or(`code.in.(${chunk.join(',')}),supplier_code.in.(${chunk.join(',')})`);
    products.push(...((data ?? []) as typeof products));
  }
  if (products.length === 0) return lines;

  const idByCode = new Map<string, string>();
  for (const p of products) {
    if (p.code) idByCode.set(norm(p.code), p.id);
    if (p.supplier_code) idByCode.set(norm(p.supplier_code), p.id);
  }

  const ids = [...new Set(products.map((p) => p.id))];
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
    const id = idByCode.get(norm(line.codigo));
    const map = id ? byProduct.get(id) : undefined;
    if (!map || map.size === 0) return { ...line, localizacoes: '—' };
    const localizacoes = [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'pt', { numeric: true }))
      .map(([loc, qty]) => `${loc} (${qty})`)
      .join(', ');
    return { ...line, localizacoes };
  });
}
