import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Json } from '@/integrations/supabase/types';

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

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCategories = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('name');

      if (error) throw error;
      setCategories((data || []).map(mapToCategory));
    } catch (error) {
      console.error('Error fetching categories:', error);
      toast.error('Erro ao carregar categorias');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const createCategory = async (
    name: string, 
    description?: string, 
    colisNames?: Record<string, string> | null,
    requiresOrderNumber: boolean = false
  ) => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .insert({ 
          name: name.trim(), 
          description: description?.trim() || null,
          colis_names: colisNames || null,
          requires_order_number: requiresOrderNumber
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          toast.error('Já existe uma categoria com este nome');
          return null;
        }
        throw error;
      }

      const mappedData = mapToCategory(data);
      setCategories(prev => [...prev, mappedData].sort((a, b) => a.name.localeCompare(b.name)));
      toast.success('Categoria criada com sucesso');
      return mappedData;
    } catch (error) {
      console.error('Error creating category:', error);
      toast.error('Erro ao criar categoria');
      return null;
    }
  };

  const updateCategory = async (
    id: string, 
    name: string, 
    description?: string, 
    colisNames?: Record<string, string> | null,
    requiresOrderNumber?: boolean
  ) => {
    try {
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
          toast.error('Já existe uma categoria com este nome');
          return false;
        }
        throw error;
      }

      const mappedData = mapToCategory(data);
      setCategories(prev => 
        prev.map(c => c.id === id ? mappedData : c).sort((a, b) => a.name.localeCompare(b.name))
      );
      toast.success('Categoria atualizada com sucesso');
      return true;
    } catch (error) {
      console.error('Error updating category:', error);
      toast.error('Erro ao atualizar categoria');
      return false;
    }
  };

  const deleteCategory = async (id: string) => {
    try {
      const category = categories.find(c => c.id === id);
      if (category?.name === 'Geral') {
        toast.error('Não é possível excluir a categoria padrão');
        return false;
      }

      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setCategories(prev => prev.filter(c => c.id !== id));
      toast.success('Categoria excluída com sucesso');
      return true;
    } catch (error) {
      console.error('Error deleting category:', error);
      toast.error('Erro ao excluir categoria');
      return false;
    }
  };

  return {
    categories,
    loading,
    createCategory,
    updateCategory,
    deleteCategory,
    refetch: fetchCategories
  };
}
