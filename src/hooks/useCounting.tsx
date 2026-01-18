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
    const newQuantity = (existingCount?.quantity || 0) + 1;
    return updateCount(productId, colisNumber, newQuantity);
  };

  const decrementCount = async (productId: string, colisNumber: number) => {
    const existingCount = counts.find(
      c => c.product_id === productId && c.colis_number === colisNumber
    );
    const newQuantity = Math.max(0, (existingCount?.quantity || 0) - 1);
    return updateCount(productId, colisNumber, newQuantity);
  };

  const getProductWithCounts = useCallback((product: Product): ProductWithCounts => {
    const productCounts = counts.filter(c => c.product_id === product.id);
    
    // Get quantity for each colis
    const colisQuantities: Record<number, number> = {};
    for (let i = 1; i <= product.total_colis; i++) {
      const count = productCounts.find(c => c.colis_number === i);
      colisQuantities[i] = count?.quantity || 0;
    }

    // Calculate complete sets (minimum across all colis)
    const quantities = Object.values(colisQuantities);
    const completeSets = quantities.length > 0 ? Math.min(...quantities) : 0;

    // Find incomplete colis (less than completeSets + 1)
    const incompleteColis: { colis_number: number; quantity: number }[] = [];
    const excessColis: { colis_number: number; excess: number }[] = [];

    for (let i = 1; i <= product.total_colis; i++) {
      const qty = colisQuantities[i];
      if (qty < completeSets + 1 && quantities.some(q => q > qty)) {
        incompleteColis.push({ colis_number: i, quantity: qty });
      }
      if (qty > completeSets) {
        const minQty = Math.min(...quantities);
        if (qty > minQty) {
          excessColis.push({ colis_number: i, excess: qty - minQty });
        }
      }
    }

    // Determine status
    let status: ProductWithCounts['status'] = 'not_counted';
    const totalCounted = quantities.reduce((sum, q) => sum + q, 0);
    
    if (totalCounted === 0) {
      status = 'not_counted';
    } else if (incompleteColis.length > 0 || excessColis.length > 0) {
      status = incompleteColis.length > 0 ? 'incomplete' : 'excess';
    } else if (completeSets > 0) {
      status = 'complete';
    }

    return {
      ...product,
      counts: productCounts,
      completeSets,
      incompleteColis,
      excessColis,
      status
    };
  }, [counts]);

  return {
    session,
    counts,
    loading,
    updateCount,
    incrementCount,
    decrementCount,
    getProductWithCounts,
    refetch: fetchCounts
  };
}
