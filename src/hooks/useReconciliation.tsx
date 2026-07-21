import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Reconciliation, ReconciliationItem, CSVImportRow, CSVParseResult, CSVValidationError } from '@/types/reconciliation';
import { ProductWithCounts } from '@/types/stock';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from './useAuth';
import {
  parseReconciliationCSV,
  parseReconciliationXLSX,
  reParseReconciliationWithMapping,
  type ColumnMapping,
  type FileParseResult,
} from '@/lib/reconciliation/fileParser';

// Re-export types kept for backward compatibility with existing importers
export type { ColumnMapping, FileParseResult };

export function useReconciliation() {
  const [reconciliations, setReconciliations] = useState<Reconciliation[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { user } = useAuth();

  const fetchReconciliations = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('reconciliations')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar as conciliações',
        variant: 'destructive'
      });
    } else {
      setReconciliations((data as Reconciliation[]) || []);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchReconciliations();
  }, [fetchReconciliations]);

  // Pure parsing/mapping helpers live in src/lib/reconciliation/fileParser.ts.
  // Kept here as thin wrappers so existing consumers of the hook don't change.
  const parseXLSX = parseReconciliationXLSX;
  const parseCSV = parseReconciliationCSV;
  const reParseWithMapping = reParseReconciliationWithMapping;


  const createReconciliation = async (
    sessionId: string,
    name: string,
    csvData: CSVImportRow[],
    productsWithCounts: ProductWithCounts[]
  ): Promise<Reconciliation | null> => {
    if (!user) return null;

    // Create the reconciliation
    const { data: reconciliation, error: reconciliationError } = await supabase
      .from('reconciliations')
      .insert({
        session_id: sessionId,
        name,
        created_by: user.id,
        status: 'pending'
      })
      .select()
      .single();

    if (reconciliationError || !reconciliation) {
      toast({
        title: 'Erro',
        description: 'Não foi possível criar a conciliação',
        variant: 'destructive'
      });
      return null;
    }

    // Create reconciliation items by comparing CSV with counted stock
    const items: Omit<ReconciliationItem, 'id' | 'difference' | 'created_at' | 'updated_at'>[] = [];

    for (const row of csvData) {
      const product = productsWithCounts.find(
        p => p.code.toLowerCase() === row.code.toLowerCase()
      );

      const countedQuantity = product?.completeSets || 0;
      const expectedQuantity = row.quantity;
      const diff = countedQuantity - expectedQuantity;

      let status: ReconciliationItem['status'];
      if (!product) {
        status = 'not_found';
      } else if (diff === 0) {
        status = 'match';
      } else if (diff > 0) {
        status = 'surplus';
      } else {
        status = 'shortage';
      }

      // Get location and pallet from product or its counts
      const location = product?.location || null;
      const palletNumber = product?.pallet_number || null;

      items.push({
        reconciliation_id: reconciliation.id,
        product_id: product?.id || null,
        product_code: row.code,
        product_name: row.name || product?.name || 'Desconhecido',
        expected_quantity: expectedQuantity,
        counted_quantity: countedQuantity,
        status,
        notes: null,
        location,
        pallet_number: palletNumber
      });
    }

    // Also add products that were counted but not in CSV
    for (const product of productsWithCounts) {
      const inCSV = csvData.some(
        row => row.code.toLowerCase() === product.code.toLowerCase()
      );

      if (!inCSV && product.completeSets > 0) {
        items.push({
          reconciliation_id: reconciliation.id,
          product_id: product.id,
          product_code: product.code,
          product_name: product.name,
          expected_quantity: 0,
          counted_quantity: product.completeSets,
          status: 'surplus',
          notes: 'Produto não constava no ficheiro importado',
          location: product.location || null,
          pallet_number: product.pallet_number || null
        });
      }
    }

    if (items.length > 0) {
      const { error: itemsError } = await supabase
        .from('reconciliation_items')
        .insert(items);

      if (itemsError) {
        toast({
          title: 'Aviso',
          description: 'Conciliação criada, mas houve erro ao salvar alguns itens',
          variant: 'destructive'
        });
      }
    }

    toast({
      title: 'Sucesso',
      description: `Conciliação criada com ${items.length} itens`
    });

    await fetchReconciliations();
    return reconciliation as Reconciliation;
  };

  const getReconciliationItems = async (reconciliationId: string): Promise<ReconciliationItem[]> => {
    const { data, error } = await supabase
      .from('reconciliation_items')
      .select('*')
      .eq('reconciliation_id', reconciliationId)
      .order('status', { ascending: true });

    if (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os itens da conciliação',
        variant: 'destructive'
      });
      return [];
    }

    return (data as ReconciliationItem[]) || [];
  };

  const validateReconciliation = async (reconciliationId: string, notes?: string): Promise<boolean> => {
    if (!user) return false;

    const { error } = await supabase
      .from('reconciliations')
      .update({
        status: 'validated',
        validated_by: user.id,
        validated_at: new Date().toISOString(),
        notes
      })
      .eq('id', reconciliationId);

    if (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível validar a conciliação',
        variant: 'destructive'
      });
      return false;
    }

    toast({
      title: 'Sucesso',
      description: 'Conciliação validada com sucesso'
    });

    await fetchReconciliations();
    return true;
  };

  const cancelReconciliation = async (reconciliationId: string): Promise<boolean> => {
    const { error } = await supabase
      .from('reconciliations')
      .update({ status: 'cancelled' })
      .eq('id', reconciliationId);

    if (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível cancelar a conciliação',
        variant: 'destructive'
      });
      return false;
    }

    toast({
      title: 'Sucesso',
      description: 'Conciliação cancelada'
    });

    await fetchReconciliations();
    return true;
  };

  const deleteReconciliation = async (reconciliationId: string): Promise<boolean> => {
    try {
      // 1. Delete all reconciliation items
      const { error: itemsError } = await supabase
        .from('reconciliation_items')
        .delete()
        .eq('reconciliation_id', reconciliationId);

      if (itemsError) {
        console.error('Error deleting reconciliation items:', itemsError);
      }

      // 2. Delete the reconciliation
      const { error } = await supabase
        .from('reconciliations')
        .delete()
        .eq('id', reconciliationId);

      if (error) {
        toast({
          title: 'Erro',
          description: 'Não foi possível eliminar a conciliação',
          variant: 'destructive'
        });
        return false;
      }

      toast({
        title: 'Sucesso',
        description: 'Conciliação eliminada definitivamente'
      });

      await fetchReconciliations();
      return true;
    } catch (err) {
      console.error('Error deleting reconciliation:', err);
      toast({
        title: 'Erro',
        description: 'Ocorreu um erro ao eliminar a conciliação',
        variant: 'destructive'
      });
      return false;
    }
  };

  return {
    reconciliations,
    loading,
    createReconciliation,
    getReconciliationItems,
    validateReconciliation,
    cancelReconciliation,
    deleteReconciliation,
    parseCSV,
    parseXLSX,
    reParseWithMapping,
    refetch: fetchReconciliations
  };
}