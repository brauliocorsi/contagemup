import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface UnifiedMovement {
  id: string;
  type: 'entrada' | 'saida' | 'contagem_inc' | 'contagem_dec' | 'picking';
  quantity: number;
  created_at: string;
  created_by: string | null;
  source: 'stock_movement' | 'count_log' | 'picking';
  reason?: string | null;
  reference?: string | null;
  notes?: string | null;
  colis_number?: number;
  location?: string | null;
  session_name?: string | null;
}

export function useProductMovementHistory(productId: string | null) {
  return useQuery({
    queryKey: ['product-movement-history', productId],
    queryFn: async (): Promise<UnifiedMovement[]> => {
      if (!productId) return [];

      // Fetch all data sources in parallel
      const [stockMovementsRes, countLogsRes, pickingItemsRes, sessionsRes] = await Promise.all([
        // Stock movements (entradas/saídas manuais)
        supabase
          .from('stock_movements')
          .select('*')
          .eq('product_id', productId)
          .order('created_at', { ascending: false }),
        
        // Count logs (incrementos/decrementos de contagem)
        supabase
          .from('count_logs')
          .select('*, counting_sessions(name)')
          .eq('product_id', productId)
          .order('created_at', { ascending: false }),
        
        // Picking items (saídas de picking)
        supabase
          .from('picking_items')
          .select('*, picking_sessions(reference, reason, created_by, created_at)')
          .eq('product_id', productId)
          .order('picked_at', { ascending: false }),
        
        // Get counting sessions for names
        supabase
          .from('counting_sessions')
          .select('id, name'),
      ]);

      const movements: UnifiedMovement[] = [];

      // Process stock movements
      if (stockMovementsRes.data) {
        for (const sm of stockMovementsRes.data) {
          movements.push({
            id: sm.id,
            type: sm.movement_type as 'entrada' | 'saida',
            quantity: sm.quantity,
            created_at: sm.created_at,
            created_by: sm.created_by,
            source: 'stock_movement',
            reason: sm.reason,
            reference: sm.reference,
            notes: sm.notes,
          });
        }
      }

      // Process count logs
      if (countLogsRes.data) {
        const sessionsMap = new Map(
          sessionsRes.data?.map(s => [s.id, s.name]) || []
        );
        
        for (const cl of countLogsRes.data) {
          const quantityChange = cl.quantity_after - cl.quantity_before;
          movements.push({
            id: cl.id,
            type: cl.operation === 'increment' ? 'contagem_inc' : 'contagem_dec',
            quantity: Math.abs(quantityChange),
            created_at: cl.created_at,
            created_by: cl.counted_by,
            source: 'count_log',
            colis_number: cl.colis_number,
            session_name: sessionsMap.get(cl.session_id) || null,
          });
        }
      }

      // Process picking items
      if (pickingItemsRes.data) {
        for (const pi of pickingItemsRes.data) {
          const session = pi.picking_sessions as {
            reference: string | null;
            reason: string | null;
            created_by: string | null;
            created_at: string;
          } | null;
          
          movements.push({
            id: pi.id,
            type: 'picking',
            quantity: pi.quantity,
            created_at: pi.picked_at,
            created_by: session?.created_by || null,
            source: 'picking',
            reason: session?.reason,
            reference: session?.reference,
            location: pi.location,
          });
        }
      }

      // Sort all movements by date descending
      movements.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      return movements;
    },
    enabled: !!productId,
    staleTime: 30000, // 30 seconds
  });
}

// Helper to get user names for movements
export function useMovementUserNames(userIds: string[]) {
  return useQuery({
    queryKey: ['movement-user-names', userIds],
    queryFn: async () => {
      if (userIds.length === 0) return {};

      const { data } = await supabase
        .from('profiles')
        .select('user_id, name')
        .in('user_id', userIds);

      const names: Record<string, string> = {};
      data?.forEach(profile => {
        names[profile.user_id] = profile.name;
      });
      return names;
    },
    enabled: userIds.length > 0,
  });
}
