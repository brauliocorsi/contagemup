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
    queryClient.invalidateQueries({ queryKey: ['warehouse-map-counts'] });
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

  /**
   * Grava um valor absoluto na linha de contagem.
   *
   * A gravação passa pela função `set_count_quantity`, que bloqueia a linha,
   * recusa gravar se a quantidade mudou entretanto (evita apagar o trabalho de
   * outra pessoa) e escreve o registo em `count_logs` na mesma transação.
   */
  const updateCount = async (productId: string, colisNumber: number, quantity: number) => {
    if (!sessionId || !user) return false;

    const freshCount = await fetchFreshCount(productId, colisNumber);

    if (!freshCount) {
      // Localização obrigatória: não criamos linhas de stock sem morada.
      toast({
        title: 'Localização obrigatória',
        description: 'Escolha primeiro a localização deste coli (use SEM-LOCALIZACAO se ainda não souber onde fica).',
        variant: 'destructive'
      });
      return false;
    }

    const { error } = await supabase.rpc('set_count_quantity', {
      p_count_id: freshCount.id,
      p_quantity: quantity,
      p_observed_quantity: freshCount.quantity ?? 0,
    });

    if (error) {
      toast({
        title: 'Não foi possível atualizar a contagem',
        description: mapDatabaseError(error, 'Tente novamente.'),
        variant: 'destructive'
      });
      return false;
    }

    invalidateCounts();
    return true;
  };

  /** Aplica uma variação atómica (+1/−1) sobre a linha com mais unidades. */
  const applyDelta = async (productId: string, colisNumber: number, delta: number) => {
    const operationKey = `delta-${productId}-${colisNumber}`;
    if (pendingOperationsRef.current.has(operationKey)) return false;
    pendingOperationsRef.current.add(operationKey);

    try {
      const freshCount = await fetchFreshCount(productId, colisNumber);
      if (!freshCount) {
        toast({
          title: 'Localização obrigatória',
          description: 'Escolha primeiro a localização deste coli (use SEM-LOCALIZACAO se ainda não souber onde fica).',
          variant: 'destructive'
        });
        return false;
      }
      if (delta < 0 && (freshCount.quantity ?? 0) <= 0) return true;

      const { error } = await supabase.rpc('apply_count_delta', {
        p_count_id: freshCount.id,
        p_delta: delta,
      });

      if (error) {
        toast({
          title: delta > 0 ? 'Não foi possível incrementar' : 'Não foi possível decrementar',
          description: mapDatabaseError(error, 'Tente novamente.'),
          variant: 'destructive'
        });
        return false;
      }

      invalidateCounts();
      return true;
    } finally {
      pendingOperationsRef.current.delete(operationKey);
    }
  };

  const incrementCount = async (productId: string, colisNumber: number) =>
    applyDelta(productId, colisNumber, 1);

  const decrementCount = async (productId: string, colisNumber: number) => {
    const ok = await applyDelta(productId, colisNumber, -1);

    if (ok) {
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

    return ok;
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
      let failedError: unknown = null;
      // Sequential calls avoid two rows of the same coli trying to merge into
      // the destination at the same time.
      for (const count of productCounts) {
        const { error } = await supabase.rpc('assign_count_location', {
          p_count_id: count.id,
          p_location: location,
        });
        if (error) {
          failedError = error;
          break;
        }
      }

      if (failedError) {
        console.error('Erro ao atualizar localização:', failedError);
        toast({
          title: 'Erro',
          description: mapDatabaseError(failedError, 'Não foi possível atualizar a localização'),
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


  /** Variação atómica numa linha concreta (coli numa localização concreta). */
  const applyDeltaToRow = async (countId: string, delta: number) => {
    const { error } = await supabase.rpc('apply_count_delta', {
      p_count_id: countId,
      p_delta: delta,
    });

    if (error) {
      toast({
        title: delta > 0 ? 'Não foi possível incrementar' : 'Não foi possível decrementar',
        description: mapDatabaseError(error, 'Tente novamente.'),
        variant: 'destructive'
      });
      return false;
    }

    invalidateCounts();
    return true;
  };

  // Increment count at a specific location
  const incrementCountAtLocation = async (productId: string, colisNumber: number, countId?: string) => {
    if (!sessionId || !user) return false;
    if (countId) return applyDeltaToRow(countId, 1);
    return incrementCount(productId, colisNumber);
  };

  // Decrement count at a specific location
  const decrementCountAtLocation = async (productId: string, colisNumber: number, countId?: string) => {
    if (!sessionId || !user) return false;
    if (countId) {
      const existingCount = counts.find(c => c.id === countId);
      if (existingCount && existingCount.quantity <= 0) return false;
      return applyDeltaToRow(countId, -1);
    }
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
