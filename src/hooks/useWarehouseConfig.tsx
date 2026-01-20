import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface WarehouseAisle {
  id: string;
  name: string;
  description: string | null;
  display_order: number;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface WarehouseLevel {
  id: string;
  name: string;
  short_name: string;
  level_number: number;
  requires_forklift: boolean;
  color: string;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface WarehouseLocation {
  id: string;
  code: string;
  aisle_id: string | null;
  level_id: string | null;
  position_in_aisle: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  aisle?: WarehouseAisle | null;
  level?: WarehouseLevel | null;
}

export interface WarehousePallet {
  id: string;
  code: string;
  current_location_id: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  location?: WarehouseLocation | null;
}

export function useWarehouseAisles() {
  const queryClient = useQueryClient();

  const { data: aisles = [], isLoading } = useQuery({
    queryKey: ['warehouse-aisles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('warehouse_aisles')
        .select('*')
        .order('display_order', { ascending: true });
      
      if (error) throw error;
      return data as WarehouseAisle[];
    },
  });

  const createAisle = useMutation({
    mutationFn: async (aisle: Omit<WarehouseAisle, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('warehouse_aisles')
        .insert([aisle])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse-aisles'] });
      toast.success('Rua criada com sucesso');
    },
    onError: (error) => {
      toast.error('Erro ao criar rua: ' + error.message);
    },
  });

  const updateAisle = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<WarehouseAisle> & { id: string }) => {
      const { data, error } = await supabase
        .from('warehouse_aisles')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse-aisles'] });
      toast.success('Rua atualizada com sucesso');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar rua: ' + error.message);
    },
  });

  const deleteAisle = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('warehouse_aisles')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse-aisles'] });
      toast.success('Rua removida com sucesso');
    },
    onError: (error) => {
      toast.error('Erro ao remover rua: ' + error.message);
    },
  });

  return { aisles, isLoading, createAisle, updateAisle, deleteAisle };
}

export function useWarehouseLevels() {
  const queryClient = useQueryClient();

  const { data: levels = [], isLoading } = useQuery({
    queryKey: ['warehouse-levels'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('warehouse_levels')
        .select('*')
        .order('display_order', { ascending: true });
      
      if (error) throw error;
      return data as WarehouseLevel[];
    },
  });

  const createLevel = useMutation({
    mutationFn: async (level: Omit<WarehouseLevel, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('warehouse_levels')
        .insert([level])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse-levels'] });
      toast.success('Nível criado com sucesso');
    },
    onError: (error) => {
      toast.error('Erro ao criar nível: ' + error.message);
    },
  });

  const updateLevel = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<WarehouseLevel> & { id: string }) => {
      const { data, error } = await supabase
        .from('warehouse_levels')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse-levels'] });
      toast.success('Nível atualizado com sucesso');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar nível: ' + error.message);
    },
  });

  const deleteLevel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('warehouse_levels')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse-levels'] });
      toast.success('Nível removido com sucesso');
    },
    onError: (error) => {
      toast.error('Erro ao remover nível: ' + error.message);
    },
  });

  return { levels, isLoading, createLevel, updateLevel, deleteLevel };
}

export function useWarehouseLocations() {
  const queryClient = useQueryClient();

  const { data: locations = [], isLoading } = useQuery({
    queryKey: ['warehouse-locations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('warehouse_locations')
        .select(`
          *,
          aisle:warehouse_aisles(*),
          level:warehouse_levels(*)
        `)
        .order('code', { ascending: true });
      
      if (error) throw error;
      return data as WarehouseLocation[];
    },
  });

  const createLocation = useMutation({
    mutationFn: async (location: Partial<WarehouseLocation>) => {
      const { aisle, level, ...rest } = location as any;
      const { data, error } = await supabase
        .from('warehouse_locations')
        .insert(rest)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse-locations'] });
      toast.success('Localização criada com sucesso');
    },
    onError: (error) => {
      toast.error('Erro ao criar localização: ' + error.message);
    },
  });

  const updateLocation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<WarehouseLocation> & { id: string }) => {
      const { aisle, level, ...rest } = updates as any;
      const { data, error } = await supabase
        .from('warehouse_locations')
        .update(rest)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse-locations'] });
      toast.success('Localização atualizada com sucesso');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar localização: ' + error.message);
    },
  });

  const deleteLocation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('warehouse_locations')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse-locations'] });
      toast.success('Localização removida com sucesso');
    },
    onError: (error) => {
      toast.error('Erro ao remover localização: ' + error.message);
    },
  });

  return { locations, isLoading, createLocation, updateLocation, deleteLocation };
}

export function useWarehousePallets() {
  const queryClient = useQueryClient();

  const { data: pallets = [], isLoading } = useQuery({
    queryKey: ['warehouse-pallets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('warehouse_pallets')
        .select(`
          *,
          location:warehouse_locations(
            *,
            aisle:warehouse_aisles(*),
            level:warehouse_levels(*)
          )
        `)
        .order('code', { ascending: true });
      
      if (error) throw error;
      return data as WarehousePallet[];
    },
  });

  const createPallet = useMutation({
    mutationFn: async (pallet: Partial<WarehousePallet>) => {
      const { location, ...rest } = pallet as any;
      const { data, error } = await supabase
        .from('warehouse_pallets')
        .insert(rest)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse-pallets'] });
      toast.success('Palete criado com sucesso');
    },
    onError: (error) => {
      toast.error('Erro ao criar palete: ' + error.message);
    },
  });

  const updatePallet = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<WarehousePallet> & { id: string }) => {
      const { location, ...rest } = updates as any;
      const { data, error } = await supabase
        .from('warehouse_pallets')
        .update(rest)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse-pallets'] });
      toast.success('Palete atualizado com sucesso');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar palete: ' + error.message);
    },
  });

  const deletePallet = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('warehouse_pallets')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse-pallets'] });
      toast.success('Palete removido com sucesso');
    },
    onError: (error) => {
      toast.error('Erro ao remover palete: ' + error.message);
    },
  });

  return { pallets, isLoading, createPallet, updatePallet, deletePallet };
}
