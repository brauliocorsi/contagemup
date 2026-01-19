import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface ProductChange {
  id: string;
  product_id: string;
  changed_by: string | null;
  change_type: 'created' | 'updated' | 'deleted';
  field_changed: string | null;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
}

export function useProductChanges() {
  const [changes, setChanges] = useState<ProductChange[]>([]);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  const fetchChangesForProduct = useCallback(async (productId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('product_changes')
        .select('*')
        .eq('product_id', productId)
        .order('changed_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setChanges((data as ProductChange[]) || []);
    } catch (error) {
      console.error('Error fetching product changes:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const logChange = useCallback(async (
    productId: string,
    changeType: 'created' | 'updated' | 'deleted',
    fieldChanged?: string,
    oldValue?: string | number | null,
    newValue?: string | number | null
  ) => {
    if (!user) return;

    try {
      await supabase
        .from('product_changes')
        .insert({
          product_id: productId,
          changed_by: user.id,
          change_type: changeType,
          field_changed: fieldChanged || null,
          old_value: oldValue !== undefined && oldValue !== null ? String(oldValue) : null,
          new_value: newValue !== undefined && newValue !== null ? String(newValue) : null
        });
    } catch (error) {
      console.error('Error logging product change:', error);
    }
  }, [user]);

  const logMultipleChanges = useCallback(async (
    productId: string,
    changes: Array<{ field: string; oldValue: string | number | null; newValue: string | number | null }>
  ) => {
    if (!user) return;

    try {
      const inserts = changes.map(change => ({
        product_id: productId,
        changed_by: user.id,
        change_type: 'updated' as const,
        field_changed: change.field,
        old_value: change.oldValue !== null ? String(change.oldValue) : null,
        new_value: change.newValue !== null ? String(change.newValue) : null
      }));

      await supabase.from('product_changes').insert(inserts);
    } catch (error) {
      console.error('Error logging product changes:', error);
    }
  }, [user]);

  return {
    changes,
    loading,
    fetchChangesForProduct,
    logChange,
    logMultipleChanges
  };
}