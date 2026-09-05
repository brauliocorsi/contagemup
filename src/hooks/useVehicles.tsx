import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { mapDatabaseError } from '@/lib/errorMessages';

export interface Vehicle {
  id: string;
  code: string;
  plate: string | null;
}

/**
 * Viaturas reais do armazém: localizações do tipo `transport`.
 * Fonte única de verdade das carrinhas (substitui a antiga lista fixa no código).
 */
export function useVehicles() {
  return useQuery({
    queryKey: ['vehicles'],
    queryFn: async (): Promise<Vehicle[]> => {
      const { data, error } = await supabase
        .from('warehouse_locations')
        .select('id, code, plate')
        .eq('location_type', 'transport')
        .order('code', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Vehicle[];
    },
    staleTime: 60 * 1000,
  });
}

/** Matrícula legível de uma viatura (usa o código quando não há matrícula). */
export function vehiclePlate(v: Vehicle | undefined | null): string {
  if (!v) return '';
  const plate = (v.plate ?? '').trim();
  if (plate) return plate;
  const fromCode = v.code.includes('-') ? v.code.split('-').slice(1).join('-') : v.code;
  return fromCode.trim().toUpperCase();
}

export function useUpdateVehiclePlate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; plate: string }) => {
      const { error } = await supabase
        .from('warehouse_locations')
        .update({ plate: input.plate.trim().toUpperCase() || null })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vehicles'] });
      qc.invalidateQueries({ queryKey: ['warehouse-locations'] });
      toast.success('Matrícula atualizada');
    },
    onError: (e) => toast.error('Erro ao guardar matrícula: ' + mapDatabaseError(e)),
  });
}
