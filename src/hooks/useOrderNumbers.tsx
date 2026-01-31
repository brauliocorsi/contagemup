import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { OrderNumberEntry } from '@/types/stock';
import { Json } from '@/integrations/supabase/types';

// Helper to safely convert Json to Record<string, boolean>
function parseColisStatus(json: Json | null): Record<string, boolean> {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return {};
  const result: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(json)) {
    if (typeof value === 'boolean') {
      result[key] = value;
    }
  }
  return result;
}

// Helper to convert database row to OrderNumberEntry
function mapToOrderNumberEntry(
  row: {
    id: string;
    product_id: string;
    order_number: string;
    colis_status: Json | null;
    location: string | null;
    pallet_number: string | null;
    created_at: string;
    updated_at: string;
  },
  totalColis: number
): OrderNumberEntry {
  const colisStatus = parseColisStatus(row.colis_status);
  
  // Check if all colis are present (1 to totalColis)
  let isComplete = true;
  for (let i = 1; i <= totalColis; i++) {
    if (!colisStatus[i.toString()]) {
      isComplete = false;
      break;
    }
  }
  
  return {
    id: row.id,
    product_id: row.product_id,
    order_number: row.order_number,
    colis_status: colisStatus,
    is_complete: isComplete,
    location: row.location,
    pallet_number: row.pallet_number,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export function useOrderNumbers(productId?: string, totalColis: number = 1) {
  const [orderNumbers, setOrderNumbers] = useState<OrderNumberEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchOrderNumbers = useCallback(async () => {
    if (!productId) {
      setOrderNumbers([]);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('stock_order_numbers')
        .select('*')
        .eq('product_id', productId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrderNumbers((data || []).map(row => mapToOrderNumberEntry(row, totalColis)));
    } catch (error) {
      console.error('Error fetching order numbers:', error);
      toast.error('Erro ao carregar números de encomenda');
    } finally {
      setLoading(false);
    }
  }, [productId, totalColis]);

  useEffect(() => {
    fetchOrderNumbers();
  }, [fetchOrderNumbers]);

  // Add a new order number with all colis marked as present
  const addOrderNumber = async (
    orderNumber: string,
    location?: string | null,
    palletNumber?: string | null
  ): Promise<OrderNumberEntry | null> => {
    if (!productId) return null;

    // Create colis_status with all colis marked as true
    const colisStatus: Record<string, boolean> = {};
    for (let i = 1; i <= totalColis; i++) {
      colisStatus[i.toString()] = true;
    }

    try {
      const { data, error } = await supabase
        .from('stock_order_numbers')
        .insert({
          product_id: productId,
          order_number: orderNumber.trim(),
          colis_status: colisStatus,
          location: location || null,
          pallet_number: palletNumber || null
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          toast.error('Este número de encomenda já existe para este produto');
          return null;
        }
        throw error;
      }

      const entry = mapToOrderNumberEntry(data, totalColis);
      setOrderNumbers(prev => [entry, ...prev]);
      toast.success('Número de encomenda adicionado');
      return entry;
    } catch (error) {
      console.error('Error adding order number:', error);
      toast.error('Erro ao adicionar número de encomenda');
      return null;
    }
  };

  // Update colis status for a specific order number
  const updateColisStatus = async (
    orderId: string,
    colisNumber: number,
    isPresent: boolean
  ): Promise<boolean> => {
    try {
      const order = orderNumbers.find(o => o.id === orderId);
      if (!order) return false;

      const newColisStatus = { 
        ...order.colis_status, 
        [colisNumber.toString()]: isPresent 
      };

      const { error } = await supabase
        .from('stock_order_numbers')
        .update({ colis_status: newColisStatus })
        .eq('id', orderId);

      if (error) throw error;

      // Update local state
      setOrderNumbers(prev => prev.map(o => {
        if (o.id === orderId) {
          let isComplete = true;
          for (let i = 1; i <= totalColis; i++) {
            if (!newColisStatus[i.toString()]) {
              isComplete = false;
              break;
            }
          }
          return { ...o, colis_status: newColisStatus, is_complete: isComplete };
        }
        return o;
      }));

      return true;
    } catch (error) {
      console.error('Error updating colis status:', error);
      toast.error('Erro ao atualizar status do cóli');
      return false;
    }
  };

  // Update location and pallet for an order number
  const updateOrderLocation = async (
    orderId: string,
    location: string | null,
    palletNumber: string | null
  ): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('stock_order_numbers')
        .update({ location, pallet_number: palletNumber })
        .eq('id', orderId);

      if (error) throw error;

      setOrderNumbers(prev => prev.map(o => 
        o.id === orderId ? { ...o, location, pallet_number: palletNumber } : o
      ));

      return true;
    } catch (error) {
      console.error('Error updating order location:', error);
      toast.error('Erro ao atualizar localização');
      return false;
    }
  };

  // Check if an order number exists and is complete
  const verifyOrderNumber = async (orderNumber: string): Promise<OrderNumberEntry | null> => {
    if (!productId) return null;

    try {
      const { data, error } = await supabase
        .from('stock_order_numbers')
        .select('*')
        .eq('product_id', productId)
        .eq('order_number', orderNumber.trim())
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // Not found
          return null;
        }
        throw error;
      }

      return mapToOrderNumberEntry(data, totalColis);
    } catch (error) {
      console.error('Error verifying order number:', error);
      return null;
    }
  };

  // Delete an order number (used when processing exit)
  const deleteOrderNumber = async (orderId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('stock_order_numbers')
        .delete()
        .eq('id', orderId);

      if (error) throw error;

      setOrderNumbers(prev => prev.filter(o => o.id !== orderId));
      return true;
    } catch (error) {
      console.error('Error deleting order number:', error);
      toast.error('Erro ao remover número de encomenda');
      return false;
    }
  };

  // Get all complete order numbers (ready for exit)
  const getCompleteOrders = (): OrderNumberEntry[] => {
    return orderNumbers.filter(o => o.is_complete);
  };

  // Get all incomplete order numbers
  const getIncompleteOrders = (): OrderNumberEntry[] => {
    return orderNumbers.filter(o => !o.is_complete);
  };

  return {
    orderNumbers,
    loading,
    addOrderNumber,
    updateColisStatus,
    updateOrderLocation,
    verifyOrderNumber,
    deleteOrderNumber,
    getCompleteOrders,
    getIncompleteOrders,
    refetch: fetchOrderNumbers
  };
}

// Standalone function to verify order number without hook
export async function verifyOrderNumberForProduct(
  productId: string, 
  orderNumber: string,
  totalColis: number
): Promise<OrderNumberEntry | null> {
  try {
    const { data, error } = await supabase
      .from('stock_order_numbers')
      .select('*')
      .eq('product_id', productId)
      .eq('order_number', orderNumber.trim())
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    return mapToOrderNumberEntry(data, totalColis);
  } catch (error) {
    console.error('Error verifying order number:', error);
    return null;
  }
}

// Standalone function to delete order number after exit
export async function removeOrderNumberAfterExit(orderId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('stock_order_numbers')
      .delete()
      .eq('id', orderId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error removing order number:', error);
    return false;
  }
}
