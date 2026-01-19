import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ActiveCountInfo {
  sessionId: string;
  sessionName: string;
  totalCounts: number;
}

export function useActiveProductCounts() {
  const [loading, setLoading] = useState(false);

  const checkActiveCountsForProduct = useCallback(async (productId: string): Promise<ActiveCountInfo[]> => {
    setLoading(true);
    try {
      // Get all counts for this product in active sessions
      const { data: counts, error: countsError } = await supabase
        .from('counts')
        .select(`
          session_id,
          quantity,
          counting_sessions!inner (
            id,
            name,
            status
          )
        `)
        .eq('product_id', productId);

      if (countsError) throw countsError;

      // Filter for active sessions and group by session
      const sessionMap = new Map<string, { name: string; totalCounts: number }>();
      
      counts?.forEach((count: any) => {
        if (count.counting_sessions?.status === 'active' && count.quantity > 0) {
          const sessionId = count.session_id;
          const existing = sessionMap.get(sessionId);
          if (existing) {
            existing.totalCounts += count.quantity;
          } else {
            sessionMap.set(sessionId, {
              name: count.counting_sessions.name,
              totalCounts: count.quantity
            });
          }
        }
      });

      const result: ActiveCountInfo[] = [];
      sessionMap.forEach((value, key) => {
        result.push({
          sessionId: key,
          sessionName: value.name,
          totalCounts: value.totalCounts
        });
      });

      return result;
    } catch (error) {
      console.error('Error checking active counts:', error);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    checkActiveCountsForProduct
  };
}