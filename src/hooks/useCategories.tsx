import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Category {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
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
      setCategories(data || []);
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

  const createCategory = async (name: string, description?: string) => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .insert({ name: name.trim(), description: description?.trim() || null })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          toast.error('Já existe uma categoria com este nome');
          return null;
        }
        throw error;
      }

      setCategories(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      toast.success('Categoria criada com sucesso');
      return data;
    } catch (error) {
      console.error('Error creating category:', error);
      toast.error('Erro ao criar categoria');
      return null;
    }
  };

  const updateCategory = async (id: string, name: string, description?: string) => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .update({ name: name.trim(), description: description?.trim() || null })
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

      setCategories(prev => 
        prev.map(c => c.id === id ? data : c).sort((a, b) => a.name.localeCompare(b.name))
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
