// MÓDULO EXPERIMENTAL REMOVÍVEL — leitura do físico do Contagem (só SELECT).
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PhysicalEntry {
  codigo: string;
  nome: string;
  /** Conjuntos completos livres = min das quantidades por coli em localizações de stock. */
  livre: number;
  /** Unidades existentes mas não livres (quarentena, cais, viatura, conferência, zona livre, localização desconhecida). */
  aRever: number;
  review: string[];
}

async function fetchAll<T>(table: string, columns: string, order: string): Promise<T[]> {
  const out: T[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await supabase
      .from(table as never)
      .select(columns)
      .order(order, { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + size - 1);
    if (error) throw error;
    const batch = (data ?? []) as unknown as T[];
    out.push(...batch);
    if (batch.length < size) break;
  }
  return out;
}

export function usePhysicalCoverage(enabled: boolean) {
  return useQuery({
    queryKey: ['needs-lab', 'physical-coverage'],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const [products, counts, locations] = await Promise.all([
        fetchAll<{ id: string; code: string; name: string; total_colis: number }>(
          'products',
          'id,code,name,total_colis',
          'code',
        ),
        fetchAll<{ id: string; product_id: string; colis_number: number; quantity: number; location: string | null }>(
          'counts',
          'id,product_id,colis_number,quantity,location',
          'product_id',
        ),
        fetchAll<{ id: string; code: string; location_type: string; is_staging: boolean }>(
          'warehouse_locations',
          'id,code,location_type,is_staging',
          'code',
        ),
      ]);

      const freeLocations = new Set(
        locations.filter((l) => l.location_type === 'stock' && !l.is_staging).map((l) => l.code.trim().toUpperCase()),
      );
      const knownLocations = new Set(locations.map((l) => l.code.trim().toUpperCase()));

      const byProduct = new Map<string, { free: Map<number, number>; other: number; unknownLoc: Set<string> }>();
      for (const c of counts) {
        const entry = byProduct.get(c.product_id) ?? { free: new Map<number, number>(), other: 0, unknownLoc: new Set<string>() };
        const loc = (c.location ?? '').trim().toUpperCase();
        const qty = Number(c.quantity) || 0;
        if (loc && freeLocations.has(loc)) {
          entry.free.set(c.colis_number, (entry.free.get(c.colis_number) ?? 0) + Math.max(0, qty));
        } else {
          if (qty > 0) entry.other += qty;
          if (loc && !knownLocations.has(loc)) entry.unknownLoc.add(loc);
          if (!loc && qty > 0) entry.unknownLoc.add('(sem localização)');
        }
        byProduct.set(c.product_id, entry);
      }

      const map = new Map<string, PhysicalEntry>();
      for (const p of products) {
        const entry = byProduct.get(p.id);
        const totalColis = Math.max(1, Number(p.total_colis) || 1);
        let livre = 0;
        if (entry) {
          // Colis não são conjuntos completos: o conjunto é limitado pelo coli mais escasso.
          let min = Number.POSITIVE_INFINITY;
          for (let coli = 1; coli <= totalColis; coli++) {
            min = Math.min(min, entry.free.get(coli) ?? 0);
          }
          livre = Number.isFinite(min) ? Math.max(0, min) : 0;
        }
        const review: string[] = [];
        if (entry && entry.unknownLoc.size > 0) {
          review.push(
            `Existe stock em ${entry.unknownLoc.size} localização(ões) sem tipo definido/sem localização — não contado como livre.`,
          );
        }
        map.set(p.code.trim().toLowerCase(), {
          codigo: p.code,
          nome: p.name,
          livre,
          aRever: entry?.other ?? 0,
          review,
        });
      }
      return { map, produtos: products.length, contagens: counts.length, localizacoesLivres: freeLocations.size };
    },
  });
}
