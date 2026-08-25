import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ProductStockPlacement {
  /** localizações com quantidade > 0 */
  locations: string[];
  /** localizações não-stock (cais, transporte, quarentena, zonas livres) */
  nonStockLocations: string[];
  /** true quando tem stock mas nenhuma unidade em localização de stock */
  blocked: boolean;
}

const norm = (s: string | null | undefined) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();

async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const page = 1000;
  let from = 0;
  const out: T[] = [];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await build(from, from + page - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < page) break;
    from += page;
  }
  return out;
}

/**
 * Devolve, por produto, onde está o stock e se o picking deve ser bloqueado
 * (stock existente apenas em localizações que não são de tipo `stock`).
 */
export function usePickingStockLocations(productIds: string[]) {
  const ids = [...new Set(productIds.filter(Boolean))].sort();

  return useQuery({
    queryKey: ['picking-stock-locations', ids],
    enabled: ids.length > 0,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<Record<string, ProductStockPlacement>> => {
      const [counts, locations] = await Promise.all([
        fetchAll<{ product_id: string; location: string | null; quantity: number }>((from, to) =>
          supabase
            .from('counts')
            .select('product_id, location, quantity')
            .in('product_id', ids)
            .gt('quantity', 0)
            .range(from, to),
        ),
        fetchAll<{ code: string; location_type: string | null; is_staging: boolean | null }>((from, to) =>
          supabase.from('warehouse_locations').select('code, location_type, is_staging').range(from, to),
        ),
      ]);

      const typeByCode = new Map<string, { type: string; staging: boolean }>();
      for (const l of locations) {
        typeByCode.set(norm(l.code), {
          type: l.location_type ?? 'stock',
          staging: !!l.is_staging,
        });
      }

      const result: Record<string, ProductStockPlacement> = {};
      for (const c of counts) {
        const label = (c.location ?? '').trim();
        if (!label) continue;
        const entry = (result[c.product_id] ??= { locations: [], nonStockLocations: [], blocked: false });
        if (!entry.locations.includes(label)) entry.locations.push(label);

        const meta = typeByCode.get(norm(label));
        // localizações desconhecidas são tratadas como stock (não bloqueiam)
        const isStock = !meta || (meta.type === 'stock' && !meta.staging);
        if (!isStock && !entry.nonStockLocations.includes(label)) entry.nonStockLocations.push(label);
      }

      for (const entry of Object.values(result)) {
        entry.blocked = entry.locations.length > 0 && entry.nonStockLocations.length === entry.locations.length;
      }

      return result;
    },
  });
}
