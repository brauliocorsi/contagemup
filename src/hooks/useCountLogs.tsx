import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface CountLog {
  id: string;
  product_id: string;
  session_id: string;
  colis_number: number;
  operation: 'increment' | 'decrement';
  quantity_before: number;
  quantity_after: number;
  counted_by: string | null;
  created_at: string;
}

export function useCountLogs() {
  const [logs, setLogs] = useState<CountLog[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLogsForProduct = useCallback(async (productId: string, sessionId?: string) => {
    setLoading(true);
    try {
      let query = supabase
        .from('count_logs')
        .select('*')
        .eq('product_id', productId)
        .order('created_at', { ascending: false })
        .limit(30);

      if (sessionId) {
        query = query.eq('session_id', sessionId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setLogs((data as CountLog[]) || []);
    } catch (error) {
      console.error('Error fetching count logs:', error);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    logs,
    loading,
    fetchLogsForProduct
  };
}
