import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from './useAuth';

export interface PickingItem {
  id: string;
  picking_session_id: string;
  product_id: string | null;
  product_code: string;
  product_name: string;
  quantity: number;
  location: string | null;
  requires_forklift: boolean;
  level_name: string | null;
  aisle_name: string | null;
  picked_at: string;
}

export interface PickingSession {
  id: string;
  reference: string | null;
  reason: string | null;
  notes: string | null;
  total_products: number;
  total_units: number;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
  status: string;
  operator_name?: string;
  items?: PickingItem[];
}

export interface CreatePickingSessionData {
  reference?: string;
  reason?: string;
  notes?: string;
  items: {
    product_id: string;
    product_code: string;
    product_name: string;
    quantity: number;
    location?: string;
    requires_forklift?: boolean;
    level_name?: string;
    aisle_name?: string;
  }[];
}

export interface PickingFilters {
  startDate?: Date;
  endDate?: Date;
  operatorId?: string;
  search?: string;
}

export function usePickingHistory(filters?: PickingFilters) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Fetch picking sessions with operator info
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['picking-sessions', filters],
    queryFn: async () => {
      let query = supabase
        .from('picking_sessions')
        .select('*')
        .order('created_at', { ascending: false });

      if (filters?.startDate) {
        query = query.gte('created_at', filters.startDate.toISOString());
      }
      if (filters?.endDate) {
        const endOfDay = new Date(filters.endDate);
        endOfDay.setHours(23, 59, 59, 999);
        query = query.lte('created_at', endOfDay.toISOString());
      }
      if (filters?.operatorId) {
        query = query.eq('created_by', filters.operatorId);
      }
      if (filters?.search) {
        query = query.or(`reference.ilike.%${filters.search}%,reason.ilike.%${filters.search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Fetch operator names
      const operatorIds = [...new Set((data || []).map(s => s.created_by).filter(Boolean))];
      let profiles: Record<string, string> = {};
      
      if (operatorIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('user_id, name')
          .in('user_id', operatorIds);
        
        profiles = (profilesData || []).reduce((acc, p) => {
          acc[p.user_id] = p.name;
          return acc;
        }, {} as Record<string, string>);
      }

      return (data || []).map(session => ({
        ...session,
        operator_name: session.created_by ? profiles[session.created_by] || 'Desconhecido' : 'Sistema',
      })) as PickingSession[];
    },
  });

  // Fetch items for a specific session
  const fetchSessionItems = async (sessionId: string): Promise<PickingItem[]> => {
    const { data, error } = await supabase
      .from('picking_items')
      .select('*')
      .eq('picking_session_id', sessionId)
      .order('requires_forklift', { ascending: false })
      .order('location');

    if (error) throw error;
    return data || [];
  };

  // Create a new picking session with items
  const createSession = useMutation({
    mutationFn: async (data: CreatePickingSessionData) => {
      const totalProducts = data.items.length;
      const totalUnits = data.items.reduce((sum, item) => sum + item.quantity, 0);

      // Create session
      const { data: session, error: sessionError } = await supabase
        .from('picking_sessions')
        .insert({
          reference: data.reference || null,
          reason: data.reason || null,
          notes: data.notes || null,
          total_products: totalProducts,
          total_units: totalUnits,
          created_by: user?.id || null,
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (sessionError) throw sessionError;

      // Create items
      const items = data.items.map(item => ({
        picking_session_id: session.id,
        product_id: item.product_id,
        product_code: item.product_code,
        product_name: item.product_name,
        quantity: item.quantity,
        location: item.location || null,
        requires_forklift: item.requires_forklift ?? false,
        level_name: item.level_name || null,
        aisle_name: item.aisle_name || null,
      }));

      const { error: itemsError } = await supabase
        .from('picking_items')
        .insert(items);

      if (itemsError) throw itemsError;

      return session;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['picking-sessions'] });
    },
    onError: (error) => {
      console.error('Error creating picking session:', error);
      toast.error('Erro ao registar sessão de picking');
    },
  });

  // Delete a picking session
  const deleteSession = useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase
        .from('picking_sessions')
        .delete()
        .eq('id', sessionId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['picking-sessions'] });
      toast.success('Sessão de picking eliminada');
    },
    onError: (error) => {
      console.error('Error deleting picking session:', error);
      toast.error('Erro ao eliminar sessão de picking');
    },
  });

  return {
    sessions,
    isLoading,
    fetchSessionItems,
    createSession,
    deleteSession,
  };
}

// Hook to get picking data for products (locations from counts)
export function usePickingData(productIds: string[]) {
  return useQuery({
    queryKey: ['picking-data', productIds],
    queryFn: async () => {
      if (productIds.length === 0) return {};

      // Fetch counts for the products
      const { data: counts, error: countsError } = await supabase
        .from('counts')
        .select('product_id, location, colis_number, quantity')
        .in('product_id', productIds);

      if (countsError) throw countsError;

      // Fetch location metadata
      const locations = [...new Set((counts || []).map(c => c.location).filter(Boolean))];
      
      let locationMetadata: Record<string, { requires_forklift: boolean; level_name: string; aisle_name: string; position_in_aisle: number }> = {};

      if (locations.length > 0) {
        const { data: locData } = await supabase
          .from('warehouse_locations')
          .select(`
            code,
            position_in_aisle,
            warehouse_levels!warehouse_locations_level_id_fkey(name, requires_forklift),
            warehouse_aisles!warehouse_locations_aisle_id_fkey(name)
          `)
          .in('code', locations);

        locationMetadata = (locData || []).reduce((acc, loc) => {
          const level = loc.warehouse_levels as { name: string; requires_forklift: boolean } | null;
          const aisle = loc.warehouse_aisles as { name: string } | null;
          acc[loc.code] = {
            requires_forklift: level?.requires_forklift ?? false,
            level_name: level?.name ?? '',
            aisle_name: aisle?.name ?? '',
            position_in_aisle: loc.position_in_aisle ?? 0,
          };
          return acc;
        }, {} as Record<string, { requires_forklift: boolean; level_name: string; aisle_name: string; position_in_aisle: number }>);
      }

      // Group counts by product
      const productLocations: Record<string, {
        location: string | null;
        colis_number: number;
        quantity: number;
        requires_forklift: boolean;
        level_name: string;
        aisle_name: string;
        position_in_aisle: number;
      }[]> = {};

      (counts || []).forEach(count => {
        if (!productLocations[count.product_id]) {
          productLocations[count.product_id] = [];
        }
        const meta = count.location ? locationMetadata[count.location] : null;
        productLocations[count.product_id].push({
          location: count.location,
          colis_number: count.colis_number,
          quantity: count.quantity,
          requires_forklift: meta?.requires_forklift ?? false,
          level_name: meta?.level_name ?? '',
          aisle_name: meta?.aisle_name ?? '',
          position_in_aisle: meta?.position_in_aisle ?? 0,
        });
      });

      return productLocations;
    },
    enabled: productIds.length > 0,
  });
}

// Function to optimize picking route
export function optimizePickingRoute<T extends {
  requires_forklift?: boolean;
  aisle_name?: string | null;
  level_name?: string | null;
  position_in_aisle?: number;
}>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    // 1. Group by forklift requirement (forklift items first to batch forklift operations)
    const aForklift = a.requires_forklift ?? false;
    const bForklift = b.requires_forklift ?? false;
    if (aForklift !== bForklift) {
      return aForklift ? -1 : 1;
    }

    // 2. Sort by aisle (alphabetical/numerical order)
    const aisleCompare = (a.aisle_name || '').localeCompare(b.aisle_name || '', 'pt', { numeric: true });
    if (aisleCompare !== 0) return aisleCompare;

    // 3. Sort by position in aisle
    const posA = a.position_in_aisle ?? 0;
    const posB = b.position_in_aisle ?? 0;
    if (posA !== posB) return posA - posB;

    // 4. Sort by level (higher levels first when using forklift, lower first when on foot)
    const levelA = a.level_name || '';
    const levelB = b.level_name || '';
    if (aForklift) {
      // For forklift: higher levels first (descending)
      return levelB.localeCompare(levelA, 'pt', { numeric: true });
    } else {
      // For foot: ground level first (ascending)
      return levelA.localeCompare(levelB, 'pt', { numeric: true });
    }
  });
}
