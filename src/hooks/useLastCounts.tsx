import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ColisLocationInfo {
  colisNumber: number;
  quantity: number;
  location: string | null;
  palletNumber: string | null;
}

interface LastCountInfo {
  productId: string;
  sessionId: string;
  sessionName: string;
  totalQuantity: number;
  countedAt: string;
  colisLocations: ColisLocationInfo[];
  uniqueLocations: string[];
  uniquePallets: string[];
}

export function useLastCounts() {
  const [lastCounts, setLastCounts] = useState<Record<string, LastCountInfo>>({});
  const [loading, setLoading] = useState(true);

  const fetchLastCounts = useCallback(async () => {
    setLoading(true);
    try {
      // Get all counts with session info including location and pallet
      const { data: counts, error } = await supabase
        .from('counts')
        .select(`
          product_id,
          session_id,
          colis_number,
          quantity,
          location,
          pallet_number,
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

      // Second pass: collect all colis info for the most recent session of each product
      const productDataMap: Record<string, { 
        sessionId: string; 
        totalQuantity: number; 
        countedAt: string;
        colisMap: Record<number, ColisLocationInfo>;
      }> = {};

      counts?.forEach(count => {
        const recentSession = productRecentSession[count.product_id];
        if (recentSession && count.session_id === recentSession.sessionId) {
          const key = count.product_id;
          if (!productDataMap[key]) {
            productDataMap[key] = {
              sessionId: count.session_id,
              totalQuantity: 0,
              countedAt: count.counted_at,
              colisMap: {}
            };
          }
          
          productDataMap[key].totalQuantity += count.quantity;
          
          // Store colis location info
          productDataMap[key].colisMap[count.colis_number] = {
            colisNumber: count.colis_number,
            quantity: count.quantity,
            location: count.location,
            palletNumber: count.pallet_number
          };
        }
      });

      // Build final map
      const result: Record<string, LastCountInfo> = {};
      Object.entries(productDataMap).forEach(([productId, info]) => {
        const colisLocations = Object.values(info.colisMap).sort((a, b) => a.colisNumber - b.colisNumber);
        
        const uniqueLocations = [...new Set(
          colisLocations
            .map(c => c.location)
            .filter((loc): loc is string => loc !== null && loc.trim() !== '')
        )].sort();

        const uniquePallets = [...new Set(
          colisLocations
            .map(c => c.palletNumber)
            .filter((p): p is string => p !== null && p.trim() !== '')
        )].sort();

        result[productId] = {
          productId,
          sessionId: info.sessionId,
          sessionName: sessionMap[info.sessionId] || 'Sessão desconhecida',
          totalQuantity: info.totalQuantity,
          countedAt: info.countedAt,
          colisLocations,
          uniqueLocations,
          uniquePallets
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
