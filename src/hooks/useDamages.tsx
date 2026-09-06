import { useCallback } from 'react';
// Realtime updates are handled centrally by RealtimeSyncProvider (see src/hooks/useRealtimeSync.tsx)
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ProductDamage, ProductDamageWithProduct, DamageStats } from '@/types/damages';
import { mapDatabaseError } from '@/lib/errorMessages';

interface ReportDamageInput {
  product_id: string;
  quantity: number;
  colis_number?: number | null;
  damage_type: string;
  description?: string;
  location?: string;
}

interface ResolveDamageInput {
  id: string;
  resolution_type: string;
  resolution_notes?: string;
  destination_location?: string;
  supplier_reference?: string;
  /** Aceita resolver só a parte que existe em quarentena, deixando o resto pendente. */
  allow_partial?: boolean;
}

interface ResolveDamageResult {
  status: 'resolved' | 'partial' | 'already_resolved';
  quantity?: number;
  remaining?: number;
}



export function useDamages() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all damages with product info
  const { data: damages = [], isLoading: loading, refetch: fetchDamages } = useQuery({
    queryKey: ['damages'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_damages')
        .select(`
          *,
          product:products(id, code, name, category, total_colis)
        `)
        .order('created_at', { ascending: false });

      if (error) {
        toast({
          title: 'Erro',
          description: 'Não foi possível carregar as avarias',
          variant: 'destructive'
        });
        throw error;
      }

      return (data as unknown as ProductDamageWithProduct[]) || [];
    },
    staleTime: 2000,
    refetchOnWindowFocus: true,
  });

  // Realtime invalidation handled by RealtimeSyncProvider.


  // Report new damage — moves stock to quarantine via RPC (single source of truth)
  const reportDamageMutation = useMutation({
    mutationFn: async (input: ReportDamageInput) => {
      const { data, error } = await supabase.rpc('register_damage', {
        p_product_id: input.product_id,
        p_colis_number: input.colis_number ?? null,
        p_quantity: input.quantity,
        p_damage_type: input.damage_type,
        p_description: input.description ?? null,
        p_location: input.location ?? null,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({ title: 'Sucesso', description: 'Avaria registada e movida para quarentena' });
      queryClient.invalidateQueries({ queryKey: ['damages'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['counts'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro',
        description: mapDatabaseError(error, 'Não foi possível registar a avaria'),
        variant: 'destructive'
      });
    }
  });

  // Resolve damage — branches by resolution type via RPC
  const resolveDamageMutation = useMutation({
    mutationFn: async (input: ResolveDamageInput) => {
      const { data, error } = await supabase.rpc('resolve_damage', {
        p_damage_id: input.id,
        p_resolution_type: input.resolution_type,
        p_resolution_notes: input.resolution_notes ?? null,
        p_destination_location: input.destination_location ?? null,
        p_supplier_reference: input.supplier_reference ?? null,
      });

      if (error) throw error;
      return data;

    },
    onSuccess: () => {
      toast({ title: 'Sucesso', description: 'Avaria resolvida com sucesso' });
      queryClient.invalidateQueries({ queryKey: ['damages'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro',
        description: mapDatabaseError(error, 'Não foi possível resolver a avaria'),
        variant: 'destructive'
      });
    }
  });

  // Update damage metadata only (damaged_stock is kept by the sync_damaged_stock trigger)
  const updateDamageMutation = useMutation({
    mutationFn: async (input: { id: string; damage_type?: string; description?: string | null; quantity?: number; location?: string | null; colis_number?: number | null }) => {
      const { id, ...updates } = input;

      const { data, error } = await supabase
        .from('product_damages')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    onSuccess: () => {
      toast({ title: 'Sucesso', description: 'Avaria atualizada com sucesso' });
      queryClient.invalidateQueries({ queryKey: ['damages'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro',
        description: mapDatabaseError(error, 'Não foi possível atualizar a avaria'),
        variant: 'destructive'
      });
    }
  });


  const deleteDamageMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('product_damages')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return true;
    },

    onSuccess: () => {
      toast({ title: 'Sucesso', description: 'Avaria eliminada' });
      queryClient.invalidateQueries({ queryKey: ['damages'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro',
        description: mapDatabaseError(error, 'Não foi possível eliminar a avaria'),
        variant: 'destructive'
      });
    }
  });

  // Calculate stats
  const getStats = useCallback((): DamageStats => {
    const activeDamages = damages.filter(d => d.status === 'active');
    const resolvedDamages = damages.filter(d => d.status === 'resolved');
    
    const byType: Record<string, number> = {};
    const byProduct: Record<string, { count: number; units: number; name: string }> = {};

    activeDamages.forEach(d => {
      byType[d.damage_type] = (byType[d.damage_type] || 0) + d.quantity;
      
      if (d.product) {
        if (!byProduct[d.product_id]) {
          byProduct[d.product_id] = { count: 0, units: 0, name: d.product.name };
        }
        byProduct[d.product_id].count++;
        byProduct[d.product_id].units += d.quantity;
      }
    });

    return {
      totalActiveDamages: activeDamages.length,
      totalDamagedUnits: activeDamages.reduce((sum, d) => sum + d.quantity, 0),
      totalResolvedDamages: resolvedDamages.length,
      byType,
      byProduct,
    };
  }, [damages]);

  // Get damages for a specific product
  const getDamagesForProduct = useCallback((productId: string) => {
    return damages.filter(d => d.product_id === productId && d.status === 'active');
  }, [damages]);

  return {
    damages,
    loading,
    fetchDamages,
    reportDamage: reportDamageMutation.mutateAsync,
    resolveDamage: resolveDamageMutation.mutateAsync,
    updateDamage: updateDamageMutation.mutateAsync,
    deleteDamage: deleteDamageMutation.mutateAsync,
    isReporting: reportDamageMutation.isPending,
    isResolving: resolveDamageMutation.isPending,
    isUpdating: updateDamageMutation.isPending,
    getStats,
    getDamagesForProduct,
  };
}
