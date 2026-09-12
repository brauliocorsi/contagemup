// Realtime updates are handled centrally by RealtimeSyncProvider (see src/hooks/useRealtimeSync.tsx)
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
      const pageSize = 1000;

      // Quantas linhas existem? Assim as páginas seguintes vão em paralelo.
      const { count, error: countError } = await supabase
        .from('products')
        .select('id', { count: 'exact', head: true });

      if (countError) {
        toast({
          title: 'Erro',
          description: 'Não foi possível carregar os produtos',
          variant: 'destructive'
        });
        throw countError;
      }

      const total = count ?? 0;
      const pages = Math.max(1, Math.ceil(total / pageSize));

      const results = await Promise.all(
        Array.from({ length: pages }, (_, i) =>
          supabase
            .from('products')
            .select('*')
            .order('name')
            .order('id')
            .range(i * pageSize, i * pageSize + pageSize - 1)
        )
      );

      const allProducts: Product[] = [];
      for (const { data, error } of results) {
        if (error) {
          toast({
            title: 'Erro',
            description: 'Não foi possível carregar os produtos',
            variant: 'destructive'
          });
          throw error;
        }
        allProducts.push(...((data ?? []) as Product[]));
      }

      return allProducts;
    },
    staleTime: 60 * 1000, // lista grande: só refaz ao fim de 1 min (ou em tempo real)
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: true, // reabrir o ecrã revalida se os dados já estiverem velhos
  });


  // Realtime invalidation handled by RealtimeSyncProvider.


  const createProduct = async (product: Omit<Product, 'id' | 'created_at' | 'updated_at'> | { code: string; name: string; category: string; total_colis: number; description: string | null; location?: string | null }) => {
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

  const importProducts = async (productsData: Array<{ code: string; name: string; category?: string; total_colis: number; description?: string; location?: string }>) => {
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
      location: p.location || null
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
