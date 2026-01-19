import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Product } from '@/types/stock';
import { useToast } from '@/hooks/use-toast';

export function useProducts() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch products with react-query
  const { data: products = [], isLoading: loading, refetch: fetchProducts } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
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
        throw error;
      }

      return (data as Product[]) || [];
    },
  });

  const createProduct = async (product: Omit<Product, 'id' | 'created_at' | 'updated_at'> | { code: string; name: string; category: string; total_colis: number; description: string | null; location?: string | null; pallet_number?: string | null }) => {
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
    queryClient.invalidateQueries({ queryKey: ['products'] });
    return data as Product;
  };

  const updateProduct = async (id: string, updates: Partial<Product>) => {
    // Fetch current product to get old values for audit log
    const { data: currentProduct } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .single();

    const { error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', id);

    if (error) {
      toast({
        title: 'Erro',
        description: error.code === '23505' 
          ? 'Já existe um produto com este código' 
          : 'Não foi possível atualizar o produto',
        variant: 'destructive'
      });
      return false;
    }

    // Log changes to product_changes table
    if (currentProduct) {
      const { data: { user } } = await supabase.auth.getUser();
      const changePromises = Object.entries(updates).map(async ([field, newValue]) => {
        const oldValue = currentProduct[field as keyof typeof currentProduct];
        if (oldValue !== newValue) {
          await supabase.from('product_changes').insert({
            product_id: id,
            change_type: 'update',
            field_changed: field,
            old_value: oldValue?.toString() || null,
            new_value: newValue?.toString() || null,
            changed_by: user?.id || null
          });
        }
      });
      await Promise.all(changePromises);
    }

    toast({ title: 'Sucesso', description: 'Produto atualizado' });
    queryClient.invalidateQueries({ queryKey: ['products'] });
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
    queryClient.invalidateQueries({ queryKey: ['products'] });
    return true;
  };

  const importProducts = async (productsData: Array<{ code: string; name: string; category?: string; total_colis: number; description?: string; location?: string; pallet_number?: string }>) => {
    // Remove duplicate codes - keep only the last occurrence of each code
    const uniqueProductsMap = new Map<string, typeof productsData[0]>();
    for (const product of productsData) {
      uniqueProductsMap.set(product.code, product);
    }
    const uniqueProducts = Array.from(uniqueProductsMap.values());
    
    const duplicatesRemoved = productsData.length - uniqueProducts.length;
    
    const { error } = await supabase
      .from('products')
      .upsert(
        uniqueProducts.map(p => ({
          code: p.code,
          name: p.name,
          category: p.category || 'Geral',
          total_colis: p.total_colis,
          description: p.description || null,
          location: p.location || null,
          pallet_number: p.pallet_number || null
        })),
        { onConflict: 'code' }
      );

    if (error) {
      toast({
        title: 'Erro',
        description: `Erro ao importar produtos: ${error.message}`,
        variant: 'destructive'
      });
      return false;
    }

    const message = duplicatesRemoved > 0 
      ? `${uniqueProducts.length} produtos importados (${duplicatesRemoved} duplicados ignorados)`
      : `${uniqueProducts.length} produtos importados`;
    
    toast({ title: 'Sucesso', description: message });
    queryClient.invalidateQueries({ queryKey: ['products'] });
    return true;
  };

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
