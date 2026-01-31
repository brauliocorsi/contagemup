import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ProductOrderCount {
  product_id: string;
  order_count: number;
  complete_orders: number;
  incomplete_orders: number;
}

export function useProductsWithOrders() {
  const [orderCounts, setOrderCounts] = useState<Record<string, ProductOrderCount>>({});
  const [productIdsWithOrders, setProductIdsWithOrders] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const fetchOrderCounts = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all order numbers grouped by product
      const { data, error } = await supabase
        .from('stock_order_numbers')
        .select('product_id, colis_status');

      if (error) throw error;

      const counts: Record<string, ProductOrderCount> = {};
      const productIds = new Set<string>();

      (data || []).forEach(row => {
        productIds.add(row.product_id);
        
        if (!counts[row.product_id]) {
          counts[row.product_id] = {
            product_id: row.product_id,
            order_count: 0,
            complete_orders: 0,
            incomplete_orders: 0,
          };
        }

        counts[row.product_id].order_count++;

        // Check if all colis are true (complete order)
        const colisStatus = row.colis_status as Record<string, boolean> | null;
        if (colisStatus) {
          const allComplete = Object.values(colisStatus).every(v => v === true);
          if (allComplete && Object.keys(colisStatus).length > 0) {
            counts[row.product_id].complete_orders++;
          } else {
            counts[row.product_id].incomplete_orders++;
          }
        }
      });

      setOrderCounts(counts);
      setProductIdsWithOrders(productIds);
    } catch (error) {
      console.error('Error fetching order counts:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrderCounts();
  }, [fetchOrderCounts]);

  // Helper to check if a product has orders
  const hasOrders = useCallback((productId: string) => {
    return productIdsWithOrders.has(productId);
  }, [productIdsWithOrders]);

  // Helper to get order stats for a product
  const getOrderStats = useCallback((productId: string) => {
    return orderCounts[productId] || null;
  }, [orderCounts]);

  return {
    orderCounts,
    productIdsWithOrders,
    loading,
    hasOrders,
    getOrderStats,
    refetch: fetchOrderCounts,
  };
}
