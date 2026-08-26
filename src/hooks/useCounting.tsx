import { useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CountingSession, Count, Product, ProductWithCounts, ColisDetail, StockDistribution } from '@/types/stock';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from './useAuth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { mapDatabaseError } from '@/lib/errorMessages';
import { getProductWithCounts as computeProductWithCounts } from '@/lib/counting/getProductWithCounts';

export function useCounting(sessionId: string | null) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  // Estado para prevenir cliques rápidos (race condition fix)
  const pendingOperationsRef = useRef<Set<string>>(new Set());

  // Fetch session with react-query
  const { data: session = null, isLoading: sessionLoading } = useQuery({
    queryKey: ['counting-session', sessionId],
    queryFn: async () => {
      if (!sessionId) return null;
      const { data, error } = await supabase
        .from('counting_sessions')
        .select('*')
        .eq('id', sessionId)
        .maybeSingle();
      
      if (error) {
        toast({
          title: 'Erro',
          description: 'Não foi possível carregar a sessão',
          variant: 'destructive'
        });
        return null;
      }
      return data as CountingSession | null;
    },
    enabled: !!sessionId,
    staleTime: 30000, // Cache for 30 seconds
  });

  // Fetch counts with react-query - include both session counts AND administrative counts (session_id IS NULL)
  // IMPORTANT: Supabase has a default limit of 1000 rows. We need to fetch all counts.
  const { data: counts = [], isLoading: countsLoading, refetch: refetchCounts } = useQuery({
    queryKey: ['counts', sessionId],
    queryFn: async () => {
      if (!sessionId) return [];
      
      // Fetch ALL counts for this session - no limit
      // Use range to bypass the 1000 row default limit
      const allCounts: Count[] = [];
      let from = 0;
      const pageSize = 1000;
      let hasMore = true;
      
      while (hasMore) {
        const { data, error } = await supabase
          .from('counts')
          .select('*')
          .or(`session_id.eq.${sessionId},session_id.is.null`)
          .order('id', { ascending: true })
          .range(from, from + pageSize - 1);
        
        if (error) {
          console.error('Erro ao buscar counts:', error);
          toast({
            title: 'Erro',
            description: 'Não foi possível carregar as contagens',
            variant: 'destructive'
          });
          return allCounts;
        }
        
        if (data && data.length > 0) {
          allCounts.push(...(data as Count[]));
          from += pageSize;
          hasMore = data.length === pageSize;
        } else {
          hasMore = false;
        }
      }
      
      console.log(`Carregados ${allCounts.length} counts para sessão ${sessionId}`);
      return allCounts;
    },
    enabled: !!sessionId,
    staleTime: 5000, // Cache for 5 seconds
  });

  const loading = sessionLoading || countsLoading;

  // Invalidate counts to refetch - also invalidate products and last-counts for consistency
  const invalidateCounts = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['counts', sessionId] });
    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({ queryKey: ['last-counts'] });
  }, [queryClient, sessionId]);

  // Função auxiliar para buscar count fresco da BD (evita race condition)
  // IMPORTANTE: Quando um coli está dividido em múltiplas localizações, 
  // retornamos o registo com a maior quantidade (para o decremento funcionar)
  const fetchFreshCount = async (productId: string, colisNumber: number) => {
    // Primeiro tentar buscar com session_id específico
    let query = supabase
      .from('counts')
      .select('id, quantity, location, session_id')
      .eq('product_id', productId)
      .eq('colis_number', colisNumber);
    
    // Se temos sessionId, buscar esse OU administrativo (null)
    if (sessionId) {
      query = query.or(`session_id.eq.${sessionId},session_id.is.null`);
    } else {
      query = query.is('session_id', null);
    }
    
    // Buscar todos os registos para este coli (pode estar dividido)
    const { data, error } = await query;
    
    if (error) {
      console.error('Erro ao buscar count:', error);
      return null;
    }
    
    if (!data || data.length === 0) {
      return null;
    }
    
    // Se há múltiplos registos, retornar o que tem a maior quantidade
    // Isto garante que o decremento funciona mesmo quando há registos com quantity=0
    if (data.length > 1) {
      const sorted = [...data].sort((a, b) => (b.quantity || 0) - (a.quantity || 0));
      return sorted[0];
    }
    
    return data[0];
  };

  const updateCount = async (productId: string, colisNumber: number, quantity: number) => {
    console.log('updateCount chamado:', { productId, colisNumber, quantity, sessionId, userId: user?.id });
    
    if (!sessionId || !user) {
      console.log('updateCount: sessionId ou user em falta', { sessionId, user: !!user });
      return false;
    }

    // Buscar count fresco da BD para evitar stale cache
    const freshCount = await fetchFreshCount(productId, colisNumber);
    console.log('freshCount encontrado:', freshCount);

    if (freshCount) {
      const { error } = await supabase
        .from('counts')
        .update({ quantity, counted_by: user.id, updated_at: new Date().toISOString() })
        .eq('id', freshCount.id);

      if (error) {
        console.error('Erro ao actualizar count:', error);
        toast({
          title: 'Erro',
          description: 'Não foi possível atualizar a contagem',
          variant: 'destructive'
        });
        return false;
      }
      console.log('Count actualizado com sucesso');
    } else {
      console.log('Inserindo novo count');
      const { error } = await supabase
        .from('counts')
        .insert({
          session_id: sessionId,
          product_id: productId,
          colis_number: colisNumber,
          quantity,
          counted_by: user.id
        });

      if (error) {
        console.error('Erro ao inserir count:', error);
        // Se o erro for de constraint única, tentar update
        if (error.code === '23505') {
          // Registo foi criado por outro processo, tentar update
          const retryCount = await fetchFreshCount(productId, colisNumber);
          if (retryCount) {
            const { error: retryError } = await supabase
              .from('counts')
              .update({ quantity, counted_by: user.id, updated_at: new Date().toISOString() })
              .eq('id', retryCount.id);
            
            if (retryError) {
              toast({
                title: 'Erro',
                description: 'Não foi possível registar a contagem',
                variant: 'destructive'
              });
              return false;
            }
          }
        } else {
          toast({
            title: 'Erro',
            description: 'Não foi possível registar a contagem',
            variant: 'destructive'
          });
          return false;
        }
      }
    }

    invalidateCounts();
    return true;
  };

  const incrementCount = async (productId: string, colisNumber: number) => {
    const operationKey = `inc-${productId}-${colisNumber}`;
    
    // Prevenir cliques rápidos - usar ref para evitar re-renders
    if (pendingOperationsRef.current.has(operationKey)) {
      console.log('Operação já em progresso, ignorando clique');
      return false;
    }
    
    pendingOperationsRef.current.add(operationKey);
    
    try {
      // Buscar count fresco directamente da BD
      const freshCount = await fetchFreshCount(productId, colisNumber);
      const oldQuantity = freshCount?.quantity || 0;
      const newQuantity = oldQuantity + 1;
      
      const success = await updateCount(productId, colisNumber, newQuantity);
      
      if (success && sessionId) {
        // Log the count operation
        await supabase.from('count_logs').insert({
          product_id: productId,
          session_id: sessionId,
          colis_number: colisNumber,
          operation: 'increment',
          quantity_before: oldQuantity,
          quantity_after: newQuantity,
          counted_by: user?.id
        });
      }
      
      return success;
    } finally {
      pendingOperationsRef.current.delete(operationKey);
    }
  };

  const decrementCount = async (productId: string, colisNumber: number) => {
    const operationKey = `dec-${productId}-${colisNumber}`;
    
    // Prevenir cliques rápidos
    if (pendingOperationsRef.current.has(operationKey)) {
      console.log('Operação já em progresso, ignorando clique');
      return false;
    }
    
    pendingOperationsRef.current.add(operationKey);
    
    try {
      // Buscar count fresco directamente da BD
      const freshCount = await fetchFreshCount(productId, colisNumber);
      const oldQuantity = freshCount?.quantity || 0;
      const newQuantity = Math.max(0, oldQuantity - 1);
      
      if (newQuantity === oldQuantity) return true; // No change needed
      
      const success = await updateCount(productId, colisNumber, newQuantity);
      
      if (success && sessionId) {
        // Log the count operation
        await supabase.from('count_logs').insert({
          product_id: productId,
          session_id: sessionId,
          colis_number: colisNumber,
          operation: 'decrement',
          quantity_before: oldQuantity,
          quantity_after: newQuantity,
          counted_by: user?.id
        });

        // Check for stock alerts based on new count
        const { data: product } = await supabase
          .from('products')
          .select('current_stock, name, min_stock')
          .eq('id', productId)
          .maybeSingle();

        if (product) {
          const newStock = product.current_stock || 0;
          if (newStock === 0) {
            toast({
              title: 'Produto Esgotado',
              description: `${product.name} está sem stock!`,
              variant: 'destructive'
            });
          } else if (newStock <= (product.min_stock || 5)) {
            toast({
              title: 'Stock Baixo',
              description: `${product.name} está com stock baixo (${newStock})`,
            });
          }
        }
      }
      
      return success;
    } finally {
      pendingOperationsRef.current.delete(operationKey);
    }
  };

  const updateLocation = async (productId: string, location: string) => {
    if (!sessionId || !user) return false;

    // Move every positive coli row through the merge-safe RPC. This includes
    // administrative rows (session_id NULL), which are part of current stock.
    const productCounts = counts.filter(c => c.product_id === productId && c.quantity > 0);
    
    if (productCounts.length === 0) {
      // Create a count entry for colis 1 with quantity 0 just to store location
      const { error } = await supabase
        .from('counts')
        .insert({
          session_id: sessionId,
          product_id: productId,
          colis_number: 1,
          quantity: 0,
          location,
          counted_by: user.id
        });

      if (error) {
        toast({
          title: 'Erro',
          description: 'Não foi possível guardar a localização',
          variant: 'destructive'
        });
        return false;
      }
    } else {
      const results = await Promise.all(productCounts.map((count) =>
        supabase.rpc('assign_count_location', {
          p_count_id: count.id,
          p_location: location,
        })
      ));
      const failed = results.find(result => result.error);

      if (failed?.error) {
        console.error('Erro ao atualizar localização:', failed.error);
        toast({
          title: 'Erro',
          description: mapDatabaseError(failed.error, 'Não foi possível atualizar a localização'),
          variant: 'destructive'
        });
        return false;
      }
    }

    invalidateCounts();
    return true;
  };


  const updateColisLocation = async (productId: string, colisNumber: number, location: string) => {
    if (!sessionId || !user) return false;

    // Prefer the row that actually carries stock. A zero row may already exist
    // at the destination and must not hide an unlocated positive row.
    const existingCount = counts
      .filter(c => c.product_id === productId && c.colis_number === colisNumber)
      .sort((a, b) => b.quantity - a.quantity)[0];

    if (existingCount) {
      const { error } = await supabase.rpc('assign_count_location', {
        p_count_id: existingCount.id,
        p_location: location,
      });

      if (error) {
        console.error('Erro ao atualizar localização do coli:', error);
        toast({
          title: 'Erro',
          description: mapDatabaseError(error, 'Não foi possível atualizar a localização'),
          variant: 'destructive'
        });
        return false;
      }
    } else {
      // Create a count entry for this coli with quantity 0 just to store location
      const { error } = await supabase
        .from('counts')
        .insert({
          session_id: sessionId,
          product_id: productId,
          colis_number: colisNumber,
          quantity: 0,
          location,
          counted_by: user.id
        });

      if (error) {
        toast({
          title: 'Erro',
          description: 'Não foi possível guardar a localização',
          variant: 'destructive'
        });
        return false;
      }
    }

    invalidateCounts();
    return true;
  };

  // Função auxiliar para buscar quantidade correcta do produto (evita inserir 0)
  const getCorrectQuantityForProduct = async (productId: string): Promise<number> => {
    const { data: product } = await supabase
      .from('products')
      .select('current_stock')
      .eq('id', productId)
      .single();
    
    return product?.current_stock || 0;
  };



  // Memoized function to process a single product with counts
  // Now accepts optional categoryColisNames to calculate effective total colis
  const getProductWithCounts = useCallback(
    (product: Product, categoryColisNames?: Record<string, string> | null): ProductWithCounts =>
      computeProductWithCounts(product, counts, categoryColisNames),
    [counts],
  );

  const deleteOrphanCounts = async (productId: string, newTotalColis: number) => {
    if (!sessionId) return false;
    
    const { error } = await supabase
      .from('counts')
      .delete()
      .eq('session_id', sessionId)
      .eq('product_id', productId)
      .gt('colis_number', newTotalColis);

    if (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível limpar contagens órfãs',
        variant: 'destructive'
      });
      return false;
    }
    
    invalidateCounts();
    return true;
  };

  // Split stock for a coli across multiple locations (atomic RPC — works for non-admins)
  const splitColisStock = async (productId: string, colisNumber: number, distributions: StockDistribution[]) => {
    if (!sessionId || !user) return false;

    try {
      const payload = distributions
        .filter(d => d.quantity > 0)
        .map(d => ({
          quantity: d.quantity,
          location: d.location || null,
        }));

      const { error } = await supabase.rpc('split_colis_counts', {
        p_product_id: productId,
        p_session_id: sessionId,
        p_colis_number: colisNumber,
        p_distributions: payload,
      });

      if (error) throw error;

      invalidateCounts();
      toast({
        title: 'Stock dividido',
        description: `Coli ${colisNumber} distribuído em ${payload.length} localização${payload.length > 1 ? 'es' : ''}`
      });
      return true;
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: 'Não foi possível dividir o stock: ' + mapDatabaseError(error),
        variant: 'destructive'
      });
      return false;
    }
  };

  // Merge all location entries for a coli into a single location (atomic RPC — works for non-admins)
  const mergeColisStock = async (productId: string, colisNumber: number, targetLocation: string) => {
    if (!sessionId || !user) return false;

    try {
      const { data, error } = await supabase.rpc('merge_colis_counts', {
        p_product_id: productId,
        p_session_id: sessionId,
        p_colis_number: colisNumber,
        p_location: targetLocation || '',
      });

      if (error) throw error;

      invalidateCounts();
      toast({
        title: 'Stock unificado',
        description: `${data ?? 0} unidades do Coli ${colisNumber} agora em ${targetLocation || 'localização única'}`
      });
      return true;
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: 'Não foi possível unificar o stock: ' + mapDatabaseError(error),
        variant: 'destructive'
      });
      return false;
    }
  };


  // Increment count at a specific location
  const incrementCountAtLocation = async (productId: string, colisNumber: number, countId?: string) => {
    if (!sessionId || !user) return false;

    // If countId provided, increment that specific record
    if (countId) {
      const existingCount = counts.find(c => c.id === countId);
      if (!existingCount) return false;

      const oldQuantity = existingCount.quantity;
      const newQuantity = oldQuantity + 1;

      const { error } = await supabase
        .from('counts')
        .update({ quantity: newQuantity, counted_by: user.id })
        .eq('id', countId);

      if (error) {
        toast({
          title: 'Erro',
          description: 'Não foi possível incrementar',
          variant: 'destructive'
        });
        return false;
      }

      // Log and sync stock
      await supabase.from('count_logs').insert({
        product_id: productId,
        session_id: sessionId,
        colis_number: colisNumber,
        operation: 'increment',
        quantity_before: oldQuantity,
        quantity_after: newQuantity,
        counted_by: user.id
      });

      // Stock is recalculated automatically by sync_product_stock trigger
      invalidateCounts();
      return true;
    }

    // Default: use the standard increment
    return incrementCount(productId, colisNumber);
  };

  // Decrement count at a specific location
  const decrementCountAtLocation = async (productId: string, colisNumber: number, countId?: string) => {
    if (!sessionId || !user) return false;

    // If countId provided, decrement that specific record
    if (countId) {
      const existingCount = counts.find(c => c.id === countId);
      if (!existingCount || existingCount.quantity === 0) return false;

      const oldQuantity = existingCount.quantity;
      const newQuantity = oldQuantity - 1;

      const { error } = await supabase
        .from('counts')
        .update({ quantity: newQuantity, counted_by: user.id })
        .eq('id', countId);

      if (error) {
        toast({
          title: 'Erro',
          description: 'Não foi possível decrementar',
          variant: 'destructive'
        });
        return false;
      }

      // Log and sync stock
      await supabase.from('count_logs').insert({
        product_id: productId,
        session_id: sessionId,
        colis_number: colisNumber,
        operation: 'decrement',
        quantity_before: oldQuantity,
        quantity_after: newQuantity,
        counted_by: user.id
      });

      // Stock is recalculated automatically by sync_product_stock trigger
      invalidateCounts();
      return true;
    }

    // Default: use the standard decrement
    return decrementCount(productId, colisNumber);
  };

  return {
    session,
    counts,
    loading,
    updateCount,
    incrementCount,
    decrementCount,
    updateLocation,
    updateColisLocation,
    getProductWithCounts,
    deleteOrphanCounts,
    splitColisStock,
    mergeColisStock,
    incrementCountAtLocation,
    decrementCountAtLocation,
    refetch: invalidateCounts
  };
}
