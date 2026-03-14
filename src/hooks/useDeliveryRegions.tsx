import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface DeliveryRegion {
  id: string;
  name: string;
  postal_prefix_start: string;
  postal_prefix_end: string;
  default_weekday: number | null;
  color: string;
  created_at: string;
  updated_at: string;
}

const WEEKDAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export function getWeekdayName(day: number | null): string {
  if (day === null || day === undefined) return '—';
  return WEEKDAY_NAMES[day] || '—';
}

export function useDeliveryRegions() {
  const queryClient = useQueryClient();

  const { data: regions = [], isLoading } = useQuery({
    queryKey: ['delivery-regions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('delivery_regions')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as DeliveryRegion[];
    },
  });

  const createRegion = useMutation({
    mutationFn: async (region: Omit<DeliveryRegion, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('delivery_regions')
        .insert(region)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-regions'] });
      toast.success('Região criada');
    },
    onError: (err: any) => toast.error('Erro: ' + err.message),
  });

  const updateRegion = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<DeliveryRegion> & { id: string }) => {
      const { error } = await supabase
        .from('delivery_regions')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-regions'] });
      toast.success('Região atualizada');
    },
    onError: (err: any) => toast.error('Erro: ' + err.message),
  });

  const deleteRegion = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('delivery_regions')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-regions'] });
      toast.success('Região eliminada');
    },
    onError: (err: any) => toast.error('Erro: ' + err.message),
  });

  const findRegionByPostalCode = (postalCode: string): DeliveryRegion | null => {
    const prefix = parseInt(postalCode.replace(/[^0-9]/g, '').substring(0, 4));
    if (isNaN(prefix)) return null;
    return regions.find(r => {
      const start = parseInt(r.postal_prefix_start);
      const end = parseInt(r.postal_prefix_end);
      return prefix >= start && prefix <= end;
    }) || null;
  };

  return {
    regions,
    isLoading,
    createRegion,
    updateRegion,
    deleteRegion,
    findRegionByPostalCode,
  };
}
