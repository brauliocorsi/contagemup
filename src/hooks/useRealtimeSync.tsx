import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Central mapping: DB table -> React Query keys to invalidate on realtime events.
 *
 * A single channel handles all subscriptions to avoid duplicate connections
 * (React StrictMode double-mounts + per-hook channels caused reconnect loops).
 */
const TABLE_QUERY_KEYS: Record<string, string[][]> = {
  products: [['products']],
  counts: [['counts'], ['last-counts']],
  product_damages: [['damages'], ['products']],
  stock_movements: [['stock-movements'], ['recent-movements']],
  stock_order_numbers: [['stock-order-numbers'], ['order-numbers']],
};

/**
 * Mount ONCE at the app root. Subscribes to all realtime-enabled tables and
 * invalidates the relevant React Query caches on any change (insert/update/delete).
 *
 * Do NOT add per-hook postgres_changes subscriptions elsewhere — route new tables
 * through TABLE_QUERY_KEYS above.
 */
export function RealtimeSyncProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase.channel('app-realtime-sync');

    for (const [table, keys] of Object.entries(TABLE_QUERY_KEYS)) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => {
          for (const key of keys) {
            queryClient.invalidateQueries({ queryKey: key });
          }
        }
      );
    }

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return <>{children}</>;
}
