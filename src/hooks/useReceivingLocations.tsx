import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ReceivingLocation {
  id: string;
  code: string;
}

/**
 * Zonas de conferência (receção). O material dá entrada aqui antes de ser
 * arrumado na localização final de stock.
 */
export function useReceivingLocations() {
  const query = useQuery({
    queryKey: ['warehouse-locations-conferencia'],
    queryFn: async (): Promise<ReceivingLocation[]> => {
      const { data, error } = await supabase
        .from('warehouse_locations')
        .select('id, code')
        .eq('location_type', 'conferencia')
        .order('code', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60 * 1000,
  });

  const locations = query.data ?? [];
  return {
    ...query,
    locations,
    /** Zona de conferência sugerida por defeito nas entradas. */
    defaultCode: locations[0]?.code ?? '',
    codes: locations.map((l) => l.code),
  };
}
