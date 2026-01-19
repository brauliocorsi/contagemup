import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface LastCountInfo {
  productId: string;
  sessionId: string;
  sessionName: string;
  totalQuantity: number;
  countedAt: string;
}

export function useLastCounts() {
  const [lastCounts, setLastCounts] = useState<Record<string, LastCountInfo>>({});
  const [loading, setLoading] = useState(true);

  const fetchLastCounts = useCallback(async () => {
    setLoading(true);
    try {
      // Get all counts with session info
      const { data: counts, error } = await supabase
        .from('counts')
        .select(`
          product_id,
          session_id,
          quantity,
          counted_at
        `)
        .order('counted_at', { ascending: false });

      if (error) throw error;

      // Get session names
      const { data: sessions } = await supabase
        .from('counting_sessions')
        .select('id, name');

      const sessionMap: Record<string, string> = {};
      sessions?.forEach(s => {
        sessionMap[s.id] = s.name;
      });

      // Group by product_id and sum quantities per session, keeping the most recent
      const productSessionMap: Record<string, { 
        sessionId: string; 
        totalQuantity: number; 
        countedAt: string 
      }> = {};

      // First pass: find the most recent session for each product
      const productRecentSession: Record<string, { sessionId: string; countedAt: string }> = {};
      counts?.forEach(count => {
        const existing = productRecentSession[count.product_id];
        if (!existing || new Date(count.counted_at) > new Date(existing.countedAt)) {
          productRecentSession[count.product_id] = {
            sessionId: count.session_id,
            countedAt: count.counted_at
          };
        }
      });

      // Second pass: sum quantities for the most recent session of each product
      counts?.forEach(count => {
        const recentSession = productRecentSession[count.product_id];
        if (recentSession && count.session_id === recentSession.sessionId) {
          const key = count.product_id;
          if (!productSessionMap[key]) {
            productSessionMap[key] = {
              sessionId: count.session_id,
              totalQuantity: 0,
              countedAt: count.counted_at
            };
          }
          productSessionMap[key].totalQuantity += count.quantity;
        }
      });

      // Build final map
      const result: Record<string, LastCountInfo> = {};
      Object.entries(productSessionMap).forEach(([productId, info]) => {
        result[productId] = {
          productId,
          sessionId: info.sessionId,
          sessionName: sessionMap[info.sessionId] || 'Sessão desconhecida',
          totalQuantity: info.totalQuantity,
          countedAt: info.countedAt
        };
      });

      setLastCounts(result);
    } catch (error) {
      console.error('Error fetching last counts:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLastCounts();
  }, [fetchLastCounts]);

  return {
    lastCounts,
    loading,
    refetch: fetchLastCounts
  };
}
