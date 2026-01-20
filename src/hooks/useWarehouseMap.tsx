import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { 
  useWarehouseAisles, 
  useWarehouseLevels, 
  useWarehouseLocations, 
  useWarehousePallets,
  WarehouseLocation,
  WarehouseLevel,
  WarehouseAisle
} from './useWarehouseConfig';
import { toast } from 'sonner';

export interface ProductInLocation {
  countId: string; // ID of the specific count record
  productId: string;
  productName: string;
  productCode: string;
  colisNumber: number;
  quantity: number;
  palletNumber: string | null;
  // For split stock: indicates if this is one of multiple locations for same coli
  isSplitEntry: boolean;
  totalQuantityForColi: number; // Total across all locations for this coli
}

export interface LocationWithProducts extends WarehouseLocation {
  aisleName?: string;
  aisleColor?: string;
  levelName?: string;
  levelShortName?: string;
  requiresForklift?: boolean;
  levelColor?: string;
  products: ProductInLocation[];
  totalColis: number;
  totalQuantity: number; // Sum of all quantities
  totalProducts: number;
}

export interface MapCell {
  location: LocationWithProducts | null;
  aisle: WarehouseAisle;
  level: WarehouseLevel;
  position: number;
}

export function useWarehouseMap(sessionId?: string) {
  const queryClient = useQueryClient();
  const { aisles, isLoading: aislesLoading } = useWarehouseAisles();
  const { levels, isLoading: levelsLoading } = useWarehouseLevels();
  const { locations, isLoading: locationsLoading } = useWarehouseLocations();
  const { pallets, isLoading: palletsLoading } = useWarehousePallets();

  // Fetch counts for the current session (or all counts if no session)
  const { data: counts = [], isLoading: countsLoading } = useQuery({
    queryKey: ['warehouse-map-counts', sessionId],
    queryFn: async () => {
      let query = supabase
        .from('counts')
        .select(`
          *,
          product:products(id, name, code, category)
        `);
      
      if (sessionId) {
        query = query.eq('session_id', sessionId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // Build map of locations with their products
  const locationsWithProducts = useMemo(() => {
    const locationMap = new Map<string, LocationWithProducts>();

    // Initialize all configured locations with aisle and level info
    locations.forEach(loc => {
      const aisle = aisles.find(a => a.id === loc.aisle_id);
      const level = levels.find(l => l.id === loc.level_id);
      
      locationMap.set(loc.code.toLowerCase(), {
        ...loc,
        aisleName: aisle?.name,
        aisleColor: aisle?.color || undefined,
        levelName: level?.name,
        levelShortName: level?.short_name,
        requiresForklift: level?.requires_forklift,
        levelColor: level?.color || undefined,
        products: [],
        totalColis: 0,
        totalQuantity: 0,
        totalProducts: 0,
      });
    });

    // Group counts by product+coli to detect split entries
    const coliCountsMap = new Map<string, number>();
    counts.forEach(count => {
      const key = `${count.product_id}-${count.colis_number}`;
      coliCountsMap.set(key, (coliCountsMap.get(key) || 0) + 1);
    });

    // Calculate total quantity per product+coli across all locations
    const coliTotalQuantityMap = new Map<string, number>();
    counts.forEach(count => {
      const key = `${count.product_id}-${count.colis_number}`;
      coliTotalQuantityMap.set(key, (coliTotalQuantityMap.get(key) || 0) + count.quantity);
    });

    // Add products from counts
    counts.forEach(count => {
      if (!count.location || count.quantity === 0) return;
      
      const locationCode = count.location.toLowerCase();
      let locWithProducts = locationMap.get(locationCode);
      
      const coliKey = `${count.product_id}-${count.colis_number}`;
      const isSplitEntry = (coliCountsMap.get(coliKey) || 0) > 1;
      const totalQuantityForColi = coliTotalQuantityMap.get(coliKey) || count.quantity;
      
      // If location exists in our config, add the product
      if (locWithProducts) {
        locWithProducts.products.push({
          countId: count.id,
          productId: count.product_id,
          productName: count.product?.name || 'Desconhecido',
          productCode: count.product?.code || '',
          colisNumber: count.colis_number,
          quantity: count.quantity,
          palletNumber: count.pallet_number,
          isSplitEntry,
          totalQuantityForColi,
        });
        locWithProducts.totalColis++;
        locWithProducts.totalQuantity += count.quantity;
        locWithProducts.totalProducts = new Set(
          locWithProducts.products.map(p => p.productId)
        ).size;
      }
    });

    return Array.from(locationMap.values());
  }, [locations, counts, aisles, levels]);

  // Build grid structure for the visual map
  const mapGrid = useMemo(() => {
    if (!aisles.length || !levels.length) return [];

    // Sort levels by level_number descending (highest first)
    const sortedLevels = [...levels].sort((a, b) => b.level_number - a.level_number);
    
    // Find max positions per aisle
    const maxPositions = Math.max(
      ...locationsWithProducts.map(loc => loc.position_in_aisle || 1),
      3 // Minimum 3 positions
    );

    const grid: MapCell[][] = [];

    sortedLevels.forEach(level => {
      const row: MapCell[] = [];
      
      aisles.forEach(aisle => {
        for (let pos = 1; pos <= maxPositions; pos++) {
          const location = locationsWithProducts.find(
            loc => loc.aisle_id === aisle.id && 
                   loc.level_id === level.id && 
                   loc.position_in_aisle === pos
          );

          row.push({
            location: location || null,
            aisle,
            level,
            position: pos,
          });
        }
      });

      grid.push(row);
    });

    return grid;
  }, [aisles, levels, locationsWithProducts]);

  // Move product between locations (moves all quantity for that coli)
  const moveProduct = async (
    productId: string,
    colisNumber: number,
    fromLocationCode: string,
    toLocationCode: string,
    sessionId: string
  ) => {
    try {
      const { error } = await supabase
        .from('counts')
        .update({ location: toLocationCode })
        .eq('product_id', productId)
        .eq('colis_number', colisNumber)
        .eq('session_id', sessionId);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['warehouse-map-counts'] });
      toast.success(`Produto movido para ${toLocationCode}`);
    } catch (error: any) {
      toast.error('Erro ao mover produto: ' + error.message);
    }
  };

  // Move a specific count record (partial quantity) to a new location
  const movePartialProduct = async (
    countId: string,
    toLocationCode: string
  ) => {
    try {
      const { error } = await supabase
        .from('counts')
        .update({ location: toLocationCode })
        .eq('id', countId);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['warehouse-map-counts'] });
      toast.success(`Stock movido para ${toLocationCode}`);
    } catch (error: any) {
      toast.error('Erro ao mover stock: ' + error.message);
    }
  };

  const isLoading = aislesLoading || levelsLoading || locationsLoading || palletsLoading || countsLoading;

  return {
    aisles,
    levels,
    locations: locationsWithProducts,
    pallets,
    mapGrid,
    isLoading,
    moveProduct,
    movePartialProduct,
    refetch: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse-map-counts'] });
    },
  };
}
