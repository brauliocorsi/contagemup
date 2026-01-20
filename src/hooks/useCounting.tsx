import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CountingSession, Count, Product, ProductWithCounts } from '@/types/stock';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from './useAuth';

export function useCounting(sessionId: string | null) {
  const [session, setSession] = useState<CountingSession | null>(null);
  const [counts, setCounts] = useState<Count[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { user } = useAuth();

  const fetchSession = useCallback(async () => {
    if (!sessionId) {
      setSession(null);
      setCounts([]);
      setLoading(false);
      return;
    }

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
    } else {
      setSession(data as CountingSession | null);
    }
  }, [sessionId, toast]);

  const fetchCounts = useCallback(async () => {
    if (!sessionId) {
      setCounts([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('counts')
      .select('*')
      .eq('session_id', sessionId);

    if (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar as contagens',
        variant: 'destructive'
      });
    } else {
      setCounts((data as Count[]) || []);
    }
    setLoading(false);
  }, [sessionId, toast]);

  useEffect(() => {
    setLoading(true);
    fetchSession();
    fetchCounts();
  }, [fetchSession, fetchCounts]);

  // Real-time subscription
  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase
      .channel(`counts-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'counts',
          filter: `session_id=eq.${sessionId}`
        },
        () => {
          fetchCounts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, fetchCounts]);

  const updateCount = async (productId: string, colisNumber: number, quantity: number) => {
    if (!sessionId || !user) return false;

    const existingCount = counts.find(
      c => c.product_id === productId && c.colis_number === colisNumber
    );

    if (existingCount) {
      const { error } = await supabase
        .from('counts')
        .update({ quantity, counted_by: user.id })
        .eq('id', existingCount.id);

      if (error) {
        toast({
          title: 'Erro',
          description: 'Não foi possível atualizar a contagem',
          variant: 'destructive'
        });
        return false;
      }
    } else {
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
        toast({
          title: 'Erro',
          description: 'Não foi possível registar a contagem',
          variant: 'destructive'
        });
        return false;
      }
    }

    await fetchCounts();
    return true;
  };

  const incrementCount = async (productId: string, colisNumber: number) => {
    const existingCount = counts.find(
      c => c.product_id === productId && c.colis_number === colisNumber
    );
    const oldQuantity = existingCount?.quantity || 0;
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

      // Sync with product stock - increment current_stock by 1
      const { data: product } = await supabase
        .from('products')
        .select('current_stock, name, min_stock')
        .eq('id', productId)
        .maybeSingle();

      if (product) {
        const newStock = (product.current_stock || 0) + 1;
        
        await supabase
          .from('products')
          .update({ current_stock: newStock })
          .eq('id', productId);

        // Register stock movement
        await supabase.from('stock_movements').insert({
          product_id: productId,
          movement_type: 'entrada',
          quantity: 1,
          reason: 'Contagem - Sessão',
          reference: sessionId,
          created_by: user?.id
        });
      }
    }
    
    return success;
  };

  const decrementCount = async (productId: string, colisNumber: number) => {
    const existingCount = counts.find(
      c => c.product_id === productId && c.colis_number === colisNumber
    );
    const oldQuantity = existingCount?.quantity || 0;
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

      // Sync with product stock - decrement current_stock by 1
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

        // Register stock movement
        await supabase.from('stock_movements').insert({
          product_id: productId,
          movement_type: 'saida',
          quantity: 1,
          reason: 'Contagem - Sessão',
          reference: sessionId,
          created_by: user?.id
        });

        // Check for stock alerts
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

    await fetchCounts();
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

    await fetchCounts();
    return true;
  };

  const getProductWithCounts = useCallback((product: Product): ProductWithCounts => {
    const productCounts = counts.filter(c => c.product_id === product.id);
    
    // Get quantity for each colis
    const colisQuantities: Record<number, number> = {};
    for (let i = 1; i <= product.total_colis; i++) {
      const count = productCounts.find(c => c.colis_number === i);
      colisQuantities[i] = count?.quantity || 0;
    }

    // Get location and pallet from counts (session-specific) OR fallback to product defaults
    const countLocation = productCounts.find(c => c.location)?.location || null;
    const countPallet = productCounts.find(c => c.pallet_number)?.pallet_number || null;
    
    // Use session count location/pallet if available, otherwise use product's default
    const location = countLocation || product.location || null;
    const palletNumber = countPallet || product.pallet_number || null;

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

    for (let i = 1; i <= product.total_colis; i++) {
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
    // - 'complete': All colis have same quantity (no partial product in progress)
    // - 'incomplete': Some colis have more than others (partial product in progress)
    // - 'not_counted': Nothing counted yet
    let status: ProductWithCounts['status'] = 'not_counted';
    const totalCounted = quantities.reduce((sum, q) => sum + q, 0);
    
    if (totalCounted === 0) {
      status = 'not_counted';
    } else if (hasPartialProduct) {
      // Has some colis with different quantities - partial product in progress
      status = 'incomplete';
    } else if (completeSets > 0) {
      // All colis have same quantity > 0
      status = 'complete';
    }

    return {
      ...product,
      counts: productCounts,
      completeSets,
      incompleteColis,
      excessColis,
      missingForNextComplete,
      hasPartialProduct,
      location,
      palletNumber,
      status
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
    
    await fetchCounts();
    return true;
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
    getProductWithCounts,
    deleteOrphanCounts,
    refetch: fetchCounts
  };
}
