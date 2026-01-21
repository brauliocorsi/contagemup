import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PickingItemDetailed, ColisPickingDetail } from '@/types/picking';
import { MovementItem } from '@/hooks/useStockMovements';

interface ProductInfo {
  id: string;
  code: string;
  name: string;
  category: string;
  total_colis: number;
}

interface CountData {
  product_id: string;
  colis_number: number;
  quantity: number;
  location: string | null;
  pallet_number: string | null;
}

interface LocationMetadata {
  requires_forklift: boolean;
  level_name: string;
  aisle_name: string;
  position_in_aisle: number;
}

interface CategoryColisNames {
  [key: string]: string; // "1": "Cabeceira", "2": "Ilhargueiro", etc.
}

export function useDetailedPickingData(items: MovementItem[]) {
  const productIds = items.map(i => i.product_id);

  return useQuery({
    queryKey: ['detailed-picking-data', productIds],
    queryFn: async (): Promise<PickingItemDetailed[]> => {
      if (productIds.length === 0) return [];

      // 1. Fetch product details (category, total_colis)
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select('id, code, name, category, total_colis')
        .in('id', productIds);

      if (productsError) throw productsError;

      const productsMap: Record<string, ProductInfo> = {};
      (productsData || []).forEach(p => {
        productsMap[p.id] = p;
      });

      // 2. Fetch counts for all products (location data per coli)
      const { data: countsData, error: countsError } = await supabase
        .from('counts')
        .select('product_id, colis_number, quantity, location, pallet_number')
        .in('product_id', productIds);

      if (countsError) throw countsError;

      // Group counts by product_id and colis_number
      const countsByProduct: Record<string, CountData[]> = {};
      (countsData || []).forEach(count => {
        if (!countsByProduct[count.product_id]) {
          countsByProduct[count.product_id] = [];
        }
        countsByProduct[count.product_id].push(count);
      });

      // 3. Fetch location metadata
      const allLocations = [...new Set((countsData || []).map(c => c.location).filter(Boolean))] as string[];
      
      let locationMetadataMap: Record<string, LocationMetadata> = {};

      if (allLocations.length > 0) {
        const { data: locationsData } = await supabase
          .from('warehouse_locations')
          .select(`
            code,
            position_in_aisle,
            warehouse_levels!warehouse_locations_level_id_fkey(name, requires_forklift),
            warehouse_aisles!warehouse_locations_aisle_id_fkey(name)
          `)
          .in('code', allLocations);

        (locationsData || []).forEach(loc => {
          const level = loc.warehouse_levels as { name: string; requires_forklift: boolean } | null;
          const aisle = loc.warehouse_aisles as { name: string } | null;
          locationMetadataMap[loc.code] = {
            requires_forklift: level?.requires_forklift ?? false,
            level_name: level?.name ?? '',
            aisle_name: aisle?.name ?? '',
            position_in_aisle: loc.position_in_aisle ?? 0,
          };
        });
      }

      // 4. Fetch category colis_names
      const categories = [...new Set(Object.values(productsMap).map(p => p.category).filter(Boolean))];
      
      let categoryColisNamesMap: Record<string, CategoryColisNames> = {};

      if (categories.length > 0) {
        const { data: categoriesData } = await supabase
          .from('categories')
          .select('name, colis_names')
          .in('name', categories);

        (categoriesData || []).forEach(cat => {
          if (cat.colis_names && typeof cat.colis_names === 'object') {
            categoryColisNamesMap[cat.name] = cat.colis_names as CategoryColisNames;
          }
        });
      }

      // 5. Build detailed picking items
      const result: PickingItemDetailed[] = items.map(item => {
        const product = productsMap[item.product_id];
        const counts = countsByProduct[item.product_id] || [];
        const categoryColisNames = categoryColisNamesMap[product?.category] || {};

        // Group counts by colis_number and aggregate
        const colisMap: Record<number, ColisPickingDetail[]> = {};
        
        counts.forEach(count => {
          if (!colisMap[count.colis_number]) {
            colisMap[count.colis_number] = [];
          }
          
          const locMeta = count.location ? locationMetadataMap[count.location] : null;
          
          colisMap[count.colis_number].push({
            colis_number: count.colis_number,
            colis_name: categoryColisNames[String(count.colis_number)] || null,
            quantity: count.quantity,
            location: count.location,
            pallet_number: count.pallet_number,
            requires_forklift: locMeta?.requires_forklift ?? false,
            level_name: locMeta?.level_name ?? null,
            aisle_name: locMeta?.aisle_name ?? null,
            position_in_aisle: locMeta?.position_in_aisle ?? 0,
          });
        });

        // Flatten and deduplicate colis details
        const colisDetails: ColisPickingDetail[] = [];
        const totalColis = product?.total_colis || 1;

        for (let i = 1; i <= totalColis; i++) {
          const coliEntries = colisMap[i] || [];
          
          if (coliEntries.length > 0) {
            // Add all entries for this coli (may have multiple locations)
            coliEntries.forEach(entry => {
              colisDetails.push(entry);
            });
          } else {
            // No count data for this coli - add placeholder
            colisDetails.push({
              colis_number: i,
              colis_name: categoryColisNames[String(i)] || null,
              quantity: 0,
              location: null,
              pallet_number: null,
              requires_forklift: false,
              level_name: null,
              aisle_name: null,
              position_in_aisle: 0,
            });
          }
        }

        // Calculate unique locations and pallets
        const uniqueLocations = [...new Set(colisDetails.map(c => c.location).filter(Boolean))] as string[];
        const uniquePallets = [...new Set(colisDetails.map(c => c.pallet_number).filter(Boolean))] as string[];
        const hasForkliftRequired = colisDetails.some(c => c.requires_forklift);

        return {
          product_id: item.product_id,
          product_code: item.product_code,
          product_name: item.product_name,
          quantity: item.quantity,
          total_colis: totalColis,
          category: product?.category || '',
          colisDetails,
          hasMultipleLocations: uniqueLocations.length > 1,
          hasForkliftRequired,
          uniqueLocations,
          uniquePallets,
        };
      });

      return result;
    },
    enabled: productIds.length > 0,
  });
}

// Optimize picking route based on colis details
export function optimizeDetailedPickingRoute(items: PickingItemDetailed[]): PickingItemDetailed[] {
  return [...items].sort((a, b) => {
    // 1. Forklift required items first
    if (a.hasForkliftRequired !== b.hasForkliftRequired) {
      return a.hasForkliftRequired ? -1 : 1;
    }

    // 2. Sort by first coli's aisle
    const aisleA = a.colisDetails[0]?.aisle_name || '';
    const aisleB = b.colisDetails[0]?.aisle_name || '';
    const aisleCompare = aisleA.localeCompare(aisleB, 'pt', { numeric: true });
    if (aisleCompare !== 0) return aisleCompare;

    // 3. Sort by first coli's position
    const posA = a.colisDetails[0]?.position_in_aisle ?? 0;
    const posB = b.colisDetails[0]?.position_in_aisle ?? 0;
    if (posA !== posB) return posA - posB;

    // 4. Sort by first coli's level
    const levelA = a.colisDetails[0]?.level_name || '';
    const levelB = b.colisDetails[0]?.level_name || '';
    return levelA.localeCompare(levelB, 'pt', { numeric: true });
  });
}
