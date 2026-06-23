import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Json } from '@/integrations/supabase/types';
import { mapDatabaseError } from '@/lib/errorMessages';

export interface Category {
  id: string;
  name: string;
  description: string | null;
  colis_names: Record<string, string> | null;
  requires_order_number: boolean;
  created_at: string;
  updated_at: string;
}

// Helper to safely convert Json to Record<string, string>
function parseColisNames(json: Json | null): Record<string, string> | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(json)) {
    if (typeof value === 'string') {
      result[key] = value;
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

// Helper to convert database row to Category
function mapToCategory(row: {
  id: string;
  name: string;
  description: string | null;
  colis_names: Json | null;
  requires_order_number: boolean;
  created_at: string;
  updated_at: string;
}): Category {
  return {
    ...row,
    colis_names: parseColisNames(row.colis_names)
  };
}

const fetchCategoriesFromDB = async (): Promise<Category[]> => {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('name');

  if (error) throw error;
  return (data || []).map(mapToCategory);
};

export function useCategories() {
  const queryClient = useQueryClient();

  const { data: categories = [], isLoading: loading } = useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategoriesFromDB,
    staleTime: 5 * 60 * 1000, // 5 minutos - categorias mudam raramente
    gcTime: 10 * 60 * 1000, // 10 minutos
  });

  const createMutation = useMutation({
    mutationFn: async ({
      name,
      description,
      colisNames,
      requiresOrderNumber
    }: {
      name: string;
      description?: string;
      colisNames?: Record<string, string> | null;
      requiresOrderNumber?: boolean;
    }) => {
      const { data, error } = await supabase
        .from('categories')
        .insert({
          name: name.trim(),
          description: description?.trim() || null,
          colis_names: colisNames || null,
          requires_order_number: requiresOrderNumber ?? false
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error('Já existe uma categoria com este nome');
        }
        throw error;
      }

      return mapToCategory(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Categoria criada com sucesso');
    },
    onError: (error: Error) => {
      toast.error(mapDatabaseError(error, 'Erro ao criar categoria'));
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      name,
      description,
      colisNames,
      requiresOrderNumber
    }: {
      id: string;
      name: string;
      description?: string;
      colisNames?: Record<string, string> | null;
      requiresOrderNumber?: boolean;
    }) => {
      const updateData: Record<string, unknown> = {
        name: name.trim(),
        description: description?.trim() || null,
        colis_names: colisNames !== undefined ? colisNames : null
      };

      if (requiresOrderNumber !== undefined) {
        updateData.requires_order_number = requiresOrderNumber;
      }

      const { data, error } = await supabase
        .from('categories')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error('Já existe uma categoria com este nome');
        }
        throw error;
      }

      return mapToCategory(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Categoria atualizada com sucesso');
    },
    onError: (error: Error) => {
      toast.error(mapDatabaseError(error, 'Erro ao atualizar categoria'));
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const category = categories.find(c => c.id === id);
      if (category?.name === 'Geral') {
        throw new Error('Não é possível excluir a categoria padrão');
      }

      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Categoria excluída com sucesso');
    },
    onError: (error: Error) => {
      toast.error(mapDatabaseError(error, 'Erro ao excluir categoria'));
    }
  });

  const createCategory = useCallback(async (
    name: string,
    description?: string,
    colisNames?: Record<string, string> | null,
    requiresOrderNumber: boolean = false
  ) => {
    try {
      return await createMutation.mutateAsync({ name, description, colisNames, requiresOrderNumber });
    } catch {
      return null;
    }
  }, [createMutation]);

  const updateCategory = useCallback(async (
    id: string,
    name: string,
    description?: string,
    colisNames?: Record<string, string> | null,
    requiresOrderNumber?: boolean
  ) => {
    try {
      await updateMutation.mutateAsync({ id, name, description, colisNames, requiresOrderNumber });
      return true;
    } catch {
      return false;
    }
  }, [updateMutation]);

  const deleteCategory = useCallback(async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
      return true;
    } catch {
      return false;
    }
  }, [deleteMutation]);

  const refetch = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['categories'] });
  }, [queryClient]);

  return {
    categories,
    loading,
    createCategory,
    updateCategory,
    deleteCategory,
    refetch
  };
}
