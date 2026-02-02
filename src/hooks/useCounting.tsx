import { useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CountingSession, Count, Product, ProductWithCounts, ColisDetail, StockDistribution } from '@/types/stock';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from './useAuth';
import { useQuery, useQueryClient } from '@tanstack/react-query';

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
      .select('id, quantity, location, pallet_number, session_id')
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

    // Update location for all colis of this product in this session
    const productCounts = counts.filter(c => c.product_id === productId);
    
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
      // Update all existing counts for this product with the location
      const { error } = await supabase
        .from('counts')
        .update({ location })
        .eq('session_id', sessionId)
        .eq('product_id', productId);

      if (error) {
        toast({
          title: 'Erro',
          description: 'Não foi possível atualizar a localização',
          variant: 'destructive'
        });
        return false;
      }
    }

    invalidateCounts();
    return true;
  };

  const updatePalletNumber = async (productId: string, palletNumber: string) => {
    if (!sessionId || !user) return false;

    // Update pallet number for all colis of this product in this session
    const productCounts = counts.filter(c => c.product_id === productId);
    
    if (productCounts.length === 0) {
      // Create a count entry for colis 1 with quantity 0 just to store pallet number
      const { error } = await supabase
        .from('counts')
        .insert({
          session_id: sessionId,
          product_id: productId,
          colis_number: 1,
          quantity: 0,
          pallet_number: palletNumber,
          counted_by: user.id
        });

      if (error) {
        toast({
          title: 'Erro',
          description: 'Não foi possível guardar o número da palete',
          variant: 'destructive'
        });
        return false;
      }
    } else {
      // Update all existing counts for this product with the pallet number
      const { error } = await supabase
        .from('counts')
        .update({ pallet_number: palletNumber })
        .eq('session_id', sessionId)
        .eq('product_id', productId);

      if (error) {
        toast({
          title: 'Erro',
          description: 'Não foi possível atualizar o número da palete',
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

    const existingCount = counts.find(
      c => c.product_id === productId && c.colis_number === colisNumber
    );

    if (existingCount) {
      const { error } = await supabase
        .from('counts')
        .update({ location })
        .eq('id', existingCount.id);

      if (error) {
        toast({
          title: 'Erro',
          description: 'Não foi possível atualizar a localização',
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

  // Função auxiliar para buscar localização do palete
  const getLocationFromPallet = async (palletCode: string): Promise<string | null> => {
    if (!palletCode) return null;
    
    const { data: pallet } = await supabase
      .from('warehouse_pallets')
      .select(`
        current_location_id,
        location:warehouse_locations(code)
      `)
      .eq('code', palletCode)
      .maybeSingle();
    
    // @ts-ignore - nested select type issue
    return pallet?.location?.code || null;
  };

  const updateColisPalletNumber = async (
    productId: string, 
    colisNumber: number, 
    palletNumber: string,
    locationFromPallet?: string // Localização derivada do palete (opcional, se já conhecida)
  ) => {
    if (!sessionId || !user) return false;

    const existingCount = counts.find(
      c => c.product_id === productId && c.colis_number === colisNumber
    );

    // Determinar a localização do palete automaticamente
    let derivedLocation = locationFromPallet;
    if (derivedLocation === undefined && palletNumber) {
      derivedLocation = await getLocationFromPallet(palletNumber) || undefined;
    }

    if (existingCount) {
      const { error } = await supabase
        .from('counts')
        .update({ 
          pallet_number: palletNumber,
          location: derivedLocation || existingCount.location // Actualizar localização também
        })
        .eq('id', existingCount.id);

      if (error) {
        toast({
          title: 'Erro',
          description: 'Não foi possível atualizar o número da palete',
          variant: 'destructive'
        });
        return false;
      }
    } else {
      // CORRIGIDO: Buscar quantidade correcta antes de inserir (não usar 0!)
      const targetQuantity = await getCorrectQuantityForProduct(productId);
      
      const { error } = await supabase
        .from('counts')
        .insert({
          session_id: sessionId,
          product_id: productId,
          colis_number: colisNumber,
          quantity: targetQuantity, // Usa stock actual, NÃO 0!
          pallet_number: palletNumber,
          location: derivedLocation || null,
          counted_by: user.id
        });

      if (error) {
        toast({
          title: 'Erro',
          description: 'Não foi possível guardar o número da palete',
          variant: 'destructive'
        });
        return false;
      }
    }

    invalidateCounts();
    return true;
  };

  // Memoized function to process a single product with counts
  // Now accepts optional categoryColisNames to calculate effective total colis
  const getProductWithCounts = useCallback((
    product: Product, 
    categoryColisNames?: Record<string, string> | null
  ): ProductWithCounts => {
    const productCounts = counts.filter(c => c.product_id === product.id);
    
    // Calculate effective total colis: use max between product's total_colis and category's colis count
    const categoryColisCount = categoryColisNames ? Object.keys(categoryColisNames).length : 0;
    const effectiveTotalColis = Math.max(product.total_colis, categoryColisCount);
    
    // Build colis details with location/pallet per coli - now supporting multiple locations per coli
    const colisDetails: ColisDetail[] = [];
    const colisQuantities: Record<number, number> = {};
    
    for (let i = 1; i <= effectiveTotalColis; i++) {
      // Get ALL counts for this colis number (may be multiple if split across locations)
      const countsForColi = productCounts.filter(c => c.colis_number === i);
      
      // Build location entries for this coli
      const locationEntries = countsForColi.map(count => ({
        countId: count.id,
        quantity: count.quantity,
        location: count.location,
        pallet_number: count.pallet_number
      }));
      
      // Sum total quantity across all locations
      const totalQuantity = locationEntries.reduce((sum, e) => sum + e.quantity, 0);
      colisQuantities[i] = totalQuantity;
      
      // Primary location/pallet is from first entry with data
      const primaryEntry = locationEntries.find(e => e.quantity > 0) || locationEntries[0];
      
      colisDetails.push({
        colis_number: i,
        quantity: totalQuantity,
        location: primaryEntry?.location || null,
        pallet_number: primaryEntry?.pallet_number || null,
        locationEntries,
        hasMultipleLocations: locationEntries.filter(e => e.quantity > 0).length > 1
      });
    }

    // Get unique locations and pallets from all location entries
    const allLocations = colisDetails.flatMap(c => 
      c.locationEntries.map(e => e.location).filter((loc): loc is string => loc !== null && loc.trim() !== '')
    );
    const uniqueLocations = [...new Set(allLocations)].sort();

    const allPallets = colisDetails.flatMap(c => 
      c.locationEntries.map(e => e.pallet_number).filter((p): p is string => p !== null && p.trim() !== '')
    );
    const uniquePallets = [...new Set(allPallets)].sort();

    // Fallback to product defaults if no session-specific data
    const hasMultipleLocations = uniqueLocations.length > 1 || colisDetails.some(c => c.hasMultipleLocations);
    const hasMultiplePallets = uniquePallets.length > 1;

    // Primary location/pallet: from first coli with data, or product default
    const location = uniqueLocations[0] || product.location || null;
    const palletNumber = uniquePallets[0] || product.pallet_number || null;

    // Calculate complete sets (minimum across all colis)
    const quantities = Object.values(colisQuantities);
    const completeSets = quantities.length > 0 ? Math.min(...quantities) : 0;
    const maxQuantity = quantities.length > 0 ? Math.max(...quantities) : 0;

    // Find incomplete colis and what's missing for next complete
    const incompleteColis: { colis_number: number; quantity: number }[] = [];
    const excessColis: { colis_number: number; excess: number }[] = [];
    const missingForNextComplete: { colis_number: number; missing: number }[] = [];

    // Check if there's a partial product being formed (some colis have more than completeSets)
    const hasPartialProduct = maxQuantity > completeSets;

    for (let i = 1; i <= effectiveTotalColis; i++) {
      const qty = colisQuantities[i];
      
      // If this colis has less than max, it's incomplete for the partial product
      if (qty < maxQuantity) {
        incompleteColis.push({ colis_number: i, quantity: qty });
        // Calculate how many are missing to match the max (complete another product)
        missingForNextComplete.push({ colis_number: i, missing: maxQuantity - qty });
      }
      
      // If this colis has more than the minimum, it's in excess
      if (qty > completeSets && qty === maxQuantity) {
        excessColis.push({ colis_number: i, excess: qty - completeSets });
      }
    }

    // Determine status
    let status: ProductWithCounts['status'] = 'not_counted';
    const totalCounted = quantities.reduce((sum, q) => sum + q, 0);
    
    if (totalCounted === 0) {
      status = 'not_counted';
    } else if (hasPartialProduct) {
      status = 'incomplete';
    } else if (completeSets > 0) {
      status = 'complete';
    }

    // Calculate total excess parts (parts that don't form complete sets)
    const totalExcessParts = maxQuantity - completeSets;

    return {
      ...product,
      counts: productCounts,
      completeSets,
      incompleteColis,
      excessColis,
      missingForNextComplete,
      hasPartialProduct,
      totalExcessParts,
      location,
      palletNumber,
      status,
      colisDetails,
      uniqueLocations,
      uniquePallets,
      hasMultipleLocations,
      hasMultiplePallets
    };
  }, [counts]);

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

  // Split stock for a coli across multiple locations
  const splitColisStock = async (productId: string, colisNumber: number, distributions: StockDistribution[]) => {
    if (!sessionId || !user) return false;

    try {
      // Delete existing counts for this coli
      const { error: deleteError } = await supabase
        .from('counts')
        .delete()
        .eq('session_id', sessionId)
        .eq('product_id', productId)
        .eq('colis_number', colisNumber);

      if (deleteError) throw deleteError;

      // Insert new count records for each distribution
      const newCounts = distributions
        .filter(d => d.quantity > 0)
        .map(d => ({
          session_id: sessionId,
          product_id: productId,
          colis_number: colisNumber,
          quantity: d.quantity,
          location: d.location || null,
          pallet_number: d.pallet_number || null,
          counted_by: user.id
        }));

      if (newCounts.length > 0) {
        const { error: insertError } = await supabase
          .from('counts')
          .insert(newCounts);

        if (insertError) throw insertError;
      }

      invalidateCounts();
      toast({
        title: 'Stock dividido',
        description: `Coli ${colisNumber} distribuído em ${distributions.length} localização${distributions.length > 1 ? 'es' : ''}`
      });
      return true;
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: 'Não foi possível dividir o stock: ' + error.message,
        variant: 'destructive'
      });
      return false;
    }
  };

  // Merge all location entries for a coli into a single location
  const mergeColisStock = async (productId: string, colisNumber: number, targetLocation: string, targetPallet: string) => {
    if (!sessionId || !user) return false;

    try {
      // Get all counts for this coli
      const existingCounts = counts.filter(
        c => c.product_id === productId && c.colis_number === colisNumber
      );
      
      // Sum total quantity
      const totalQuantity = existingCounts.reduce((sum, c) => sum + c.quantity, 0);

      // Delete all existing counts for this coli
      const { error: deleteError } = await supabase
        .from('counts')
        .delete()
        .eq('session_id', sessionId)
        .eq('product_id', productId)
        .eq('colis_number', colisNumber);

      if (deleteError) throw deleteError;

      // Insert single merged count
      if (totalQuantity > 0) {
        const { error: insertError } = await supabase
          .from('counts')
          .insert({
            session_id: sessionId,
            product_id: productId,
            colis_number: colisNumber,
            quantity: totalQuantity,
            location: targetLocation || null,
            pallet_number: targetPallet || null,
            counted_by: user.id
          });

        if (insertError) throw insertError;
      }

      invalidateCounts();
      toast({
        title: 'Stock unificado',
        description: `${totalQuantity} unidades do Coli ${colisNumber} agora em ${targetLocation || 'localização única'}`
      });
      return true;
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: 'Não foi possível unificar o stock: ' + error.message,
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

      const { data: product } = await supabase
        .from('products')
        .select('current_stock')
        .eq('id', productId)
        .maybeSingle();

      if (product) {
        await supabase
          .from('products')
          .update({ current_stock: (product.current_stock || 0) + 1 })
          .eq('id', productId);

        await supabase.from('stock_movements').insert({
          product_id: productId,
          movement_type: 'entrada',
          quantity: 1,
          reason: 'Contagem - Sessão',
          reference: sessionId,
          created_by: user.id
        });
      }

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

      const { data: product } = await supabase
        .from('products')
        .select('current_stock, name, min_stock')
        .eq('id', productId)
        .maybeSingle();

      if (product) {
        const newStock = Math.max(0, (product.current_stock || 0) - 1);
        
        await supabase
          .from('products')
          .update({ current_stock: newStock })
          .eq('id', productId);

        await supabase.from('stock_movements').insert({
          product_id: productId,
          movement_type: 'saida',
          quantity: 1,
          reason: 'Contagem - Sessão',
          reference: sessionId,
          created_by: user.id
        });

        if (newStock === 0) {
          toast({
            title: 'Produto Esgotado',
            description: `${product.name} está sem stock!`,
            variant: 'destructive'
          });
        } else if (newStock <= (product.min_stock || 5)) {
          toast({
            title: 'Stock Baixo',
            description: `${product.name} está com stock baixo (${newStock})`
          });
        }
      }

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
    updatePalletNumber,
    updateColisLocation,
    updateColisPalletNumber,
    getProductWithCounts,
    deleteOrphanCounts,
    splitColisStock,
    mergeColisStock,
    incrementCountAtLocation,
    decrementCountAtLocation,
    refetch: invalidateCounts
  };
}
