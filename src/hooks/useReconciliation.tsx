import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Reconciliation, ReconciliationItem, CSVImportRow, CSVParseResult, CSVValidationError } from '@/types/reconciliation';
import { ProductWithCounts } from '@/types/stock';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from './useAuth';

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

      items.push({
        reconciliation_id: reconciliation.id,
        product_id: product?.id || null,
        product_code: row.code,
        product_name: row.name || product?.name || 'Desconhecido',
        expected_quantity: expectedQuantity,
        counted_quantity: countedQuantity,
        status,
        notes: null
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
          notes: 'Produto não constava no ficheiro CSV'
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

  const parseCSV = (content: string): CSVParseResult => {
    const result: CSVParseResult = {
      rows: [],
      errors: [],
      headerError: null
    };

    const lines = content.trim().split('\n');
    if (lines.length < 2) {
      result.headerError = 'O ficheiro está vazio ou não contém dados';
      return result;
    }

    const header = lines[0].toLowerCase().split(/[;,\t]/);
    const codeIndex = header.findIndex(h => h.includes('codigo') || h.includes('code') || h.includes('código'));
    const nameIndex = header.findIndex(h => h.includes('nome') || h.includes('name') || h.includes('produto'));
    const qtyIndex = header.findIndex(h => h.includes('quantidade') || h.includes('qty') || h.includes('qtd') || h.includes('quantity') || h.includes('stock'));

    if (codeIndex === -1) {
      result.headerError = 'Coluna de código não encontrada. Use: "Codigo", "Code" ou "Código"';
      return result;
    }

    if (qtyIndex === -1) {
      result.headerError = 'Coluna de quantidade não encontrada. Use: "Quantidade", "Qty", "Qtd" ou "Stock"';
      return result;
    }

    const seenCodes = new Set<string>();

    for (let i = 1; i < lines.length; i++) {
      const lineContent = lines[i].trim();
      if (!lineContent) continue; // Skip empty lines

      const values = lineContent.split(/[;,\t]/);
      const lineErrors: string[] = [];

      const code = values[codeIndex]?.trim();
      const quantityStr = values[qtyIndex]?.trim();
      const quantity = parseInt(quantityStr || '', 10);

      // Validate code
      if (!code) {
        lineErrors.push('Código em falta');
      } else if (seenCodes.has(code.toLowerCase())) {
        lineErrors.push(`Código duplicado: "${code}"`);
      }

      // Validate quantity
      if (!quantityStr) {
        lineErrors.push('Quantidade em falta');
      } else if (isNaN(quantity)) {
        lineErrors.push(`Quantidade inválida: "${quantityStr}"`);
      } else if (quantity < 0) {
        lineErrors.push('Quantidade não pode ser negativa');
      }

      if (lineErrors.length > 0) {
        result.errors.push({
          line: i + 1,
          content: lineContent.substring(0, 80) + (lineContent.length > 80 ? '...' : ''),
          errors: lineErrors
        });
      } else if (code) {
        seenCodes.add(code.toLowerCase());
        result.rows.push({
          code,
          name: nameIndex !== -1 ? values[nameIndex]?.trim() : undefined,
          quantity
        });
      }
    }

    return result;
  };

  return {
    reconciliations,
    loading,
    createReconciliation,
    getReconciliationItems,
    validateReconciliation,
    cancelReconciliation,
    parseCSV,
    refetch: fetchReconciliations
  };
}
