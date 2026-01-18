import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Product } from '@/types/stock';
import { useToast } from '@/hooks/use-toast';

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchProducts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('name');

    if (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os produtos',
        variant: 'destructive'
      });
    } else {
      setProducts((data as Product[]) || []);
    }
    setLoading(false);
  };

  const createProduct = async (product: Omit<Product, 'id' | 'created_at' | 'updated_at'>) => {
    const { data, error } = await supabase
      .from('products')
      .insert(product)
      .select()
      .single();

    if (error) {
      toast({
        title: 'Erro',
        description: error.message.includes('duplicate') 
          ? 'Já existe um produto com este código' 
          : 'Não foi possível criar o produto',
        variant: 'destructive'
      });
      return null;
    }

    toast({ title: 'Sucesso', description: 'Produto criado com sucesso' });
    await fetchProducts();
    return data as Product;
  };

  const updateProduct = async (id: string, updates: Partial<Product>) => {
    const { error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', id);

    if (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar o produto',
        variant: 'destructive'
      });
      return false;
    }

    toast({ title: 'Sucesso', description: 'Produto atualizado' });
    await fetchProducts();
    return true;
  };

  const deleteProduct = async (id: string) => {
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id);

    if (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível eliminar o produto',
        variant: 'destructive'
      });
      return false;
    }

    toast({ title: 'Sucesso', description: 'Produto eliminado' });
    await fetchProducts();
    return true;
  };

  const importProducts = async (productsData: Array<{ code: string; name: string; total_colis: number; description?: string }>) => {
    const { error } = await supabase
      .from('products')
      .upsert(
        productsData.map(p => ({
          code: p.code,
          name: p.name,
          total_colis: p.total_colis,
          description: p.description || null
        })),
        { onConflict: 'code' }
      );

    if (error) {
      toast({
        title: 'Erro',
        description: 'Erro ao importar produtos',
        variant: 'destructive'
      });
      return false;
    }

    toast({ title: 'Sucesso', description: `${productsData.length} produtos importados` });
    await fetchProducts();
    return true;
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  return {
    products,
    loading,
    fetchProducts,
    createProduct,
    updateProduct,
    deleteProduct,
    importProducts
  };
}
