import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Product } from '@/types/stock';
import { useToast } from '@/hooks/use-toast';
import { mapDatabaseError } from '@/lib/errorMessages';

export function useProducts() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch products with react-query
  const { data: products = [], isLoading: loading, refetch: fetchProducts } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const allProducts: Product[] = [];
      let from = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .order('name')
          .order('id')
          .range(from, from + pageSize - 1);

        if (error) {
          toast({
            title: 'Erro',
            description: 'Não foi possível carregar os produtos',
            variant: 'destructive'
          });
          throw error;
        }

        if (data && data.length > 0) {
          allProducts.push(...(data as Product[]));
          from += pageSize;
          hasMore = data.length === pageSize;
        } else {
          hasMore = false;
        }
      }

      return allProducts;
    },
    staleTime: 2000, // Consider data fresh for 2 seconds
    refetchOnWindowFocus: true, // Refetch when window regains focus
  });

  // Subscribe to realtime changes
  useEffect(() => {
    const channel = supabase
      .channel('products-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'products',
        },
        (payload) => {
          // Invalidate and refetch products on any change
          queryClient.invalidateQueries({ queryKey: ['products'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const createProduct = async (product: Omit<Product, 'id' | 'created_at' | 'updated_at'> | { code: string; name: string; category: string; total_colis: number; description: string | null; location?: string | null; pallet_number?: string | null }) => {
    const { data, error } = await supabase
      .from('products')
      .insert(product)
      .select()
      .single();

    if (error) {
      toast({
        title: 'Erro',
        description: mapDatabaseError(error, 'Não foi possível criar o produto'),
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
      // Clean invisible characters (tabs, extra spaces) from code and name
      const cleanCode = product.code.replace(/\t/g, '').trim();
      const cleanName = product.name.replace(/\t/g, '').trim();
      uniqueProductsMap.set(cleanCode, { ...product, code: cleanCode, name: cleanName });
    }
    const uniqueProducts = Array.from(uniqueProductsMap.values());
    
    const duplicatesRemoved = productsData.length - uniqueProducts.length;
    
    // Batch import to avoid row limits
    const BATCH_SIZE = 500;
    const productsToUpsert = uniqueProducts.map(p => ({
      code: p.code,
      name: p.name,
      category: p.category || 'Geral',
      total_colis: p.total_colis,
      description: p.description || null,
      location: p.location || null,
      pallet_number: p.pallet_number || null
    }));

    for (let i = 0; i < productsToUpsert.length; i += BATCH_SIZE) {
      const batch = productsToUpsert.slice(i, i + BATCH_SIZE);
      const { error: batchError } = await supabase
        .from('products')
        .upsert(batch, { onConflict: 'code' });

      if (batchError) {
        toast({
          title: 'Erro',
          description: `Erro ao importar lote ${Math.floor(i / BATCH_SIZE) + 1}: ${batchError.message}`,
          variant: 'destructive'
        });
        return false;
      }
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
