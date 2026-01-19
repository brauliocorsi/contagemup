import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';

export interface StockMovement {
  id: string;
  product_id: string;
  movement_type: 'entrada' | 'saida';
  quantity: number;
  reason: string | null;
  reference: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  products?: {
    code: string;
    name: string;
  };
}

export interface MovementItem {
  product_id: string;
  product_code: string;
  product_name: string;
  quantity: number;
}

export interface ParsedCSVItem {
  code: string;
  quantity: number;
  product_id?: string;
  product_name?: string;
  valid: boolean;
  error?: string;
}

export function useStockMovements(movementType?: 'entrada' | 'saida') {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isProcessing, setIsProcessing] = useState(false);

  // Fetch movements
  const { data: movements = [], isLoading } = useQuery({
    queryKey: ['stock-movements', movementType],
    queryFn: async () => {
      let query = supabase
        .from('stock_movements')
        .select(`
          *,
          products (code, name)
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (movementType) {
        query = query.eq('movement_type', movementType);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as StockMovement[];
    },
  });

  // Register single movement
  const registerMovement = useMutation({
    mutationFn: async ({
      productId,
      type,
      quantity,
      reason,
      reference,
      notes,
    }: {
      productId: string;
      type: 'entrada' | 'saida';
      quantity: number;
      reason?: string;
      reference?: string;
      notes?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();

      // Insert movement
      const { error: movementError } = await supabase
        .from('stock_movements')
        .insert({
          product_id: productId,
          movement_type: type,
          quantity,
          reason,
          reference,
          notes,
          created_by: user?.id,
        });

      if (movementError) throw movementError;

      // Update product stock
      const stockChange = type === 'entrada' ? quantity : -quantity;
      
      const { data: product } = await supabase
        .from('products')
        .select('current_stock')
        .eq('id', productId)
        .single();

      const newStock = Math.max(0, (product?.current_stock || 0) + stockChange);

      const { error: updateError } = await supabase
        .from('products')
        .update({ current_stock: newStock })
        .eq('id', productId);

      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao registar movimento',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Register bulk movements
  const registerBulkMovements = useMutation({
    mutationFn: async ({
      items,
      type,
      reason,
      reference,
      notes,
    }: {
      items: MovementItem[];
      type: 'entrada' | 'saida';
      reason?: string;
      reference?: string;
      notes?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();

      // Insert all movements
      const movements = items.map((item) => ({
        product_id: item.product_id,
        movement_type: type,
        quantity: item.quantity,
        reason,
        reference,
        notes,
        created_by: user?.id,
      }));

      const { error: movementError } = await supabase
        .from('stock_movements')
        .insert(movements);

      if (movementError) throw movementError;

      // Update each product's stock
      for (const item of items) {
        const stockChange = type === 'entrada' ? item.quantity : -item.quantity;
        
        const { data: product } = await supabase
          .from('products')
          .select('current_stock')
          .eq('id', item.product_id)
          .single();

        const newStock = Math.max(0, (product?.current_stock || 0) + stockChange);

        await supabase
          .from('products')
          .update({ current_stock: newStock })
          .eq('id', item.product_id);
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast({
        title: 'Movimentos registados',
        description: `${variables.items.length} ${variables.type === 'entrada' ? 'entradas' : 'saídas'} registadas com sucesso.`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao registar movimentos',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Parse CSV/Excel file
  const parseStockFile = async (file: File): Promise<ParsedCSVItem[]> => {
    setIsProcessing(true);
    
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);

      if (rows.length === 0) {
        throw new Error('Ficheiro vazio');
      }

      // Find code and quantity columns
      const firstRow = rows[0];
      const keys = Object.keys(firstRow);
      
      const codeAliases = ['codigo', 'code', 'cod', 'sku', 'referencia', 'ref'];
      const qtyAliases = ['quantidade', 'quantity', 'qty', 'qtd', 'quant'];

      const codeKey = keys.find(k => codeAliases.includes(k.toLowerCase().trim()));
      const qtyKey = keys.find(k => qtyAliases.includes(k.toLowerCase().trim()));

      if (!codeKey || !qtyKey) {
        throw new Error('Colunas "codigo" e "quantidade" não encontradas');
      }

      // Fetch all products for validation
      const { data: products } = await supabase
        .from('products')
        .select('id, code, name');

      const productMap = new Map(products?.map(p => [p.code.toLowerCase(), p]) || []);

      // Parse and validate each row
      const parsedItems: ParsedCSVItem[] = rows.map((row) => {
        const code = String(row[codeKey] || '').trim();
        const quantity = parseInt(String(row[qtyKey] || '0'), 10);

        const product = productMap.get(code.toLowerCase());

        if (!code) {
          return { code, quantity, valid: false, error: 'Código vazio' };
        }

        if (isNaN(quantity) || quantity <= 0) {
          return { code, quantity, valid: false, error: 'Quantidade inválida' };
        }

        if (!product) {
          return { code, quantity, valid: false, error: 'Produto não encontrado' };
        }

        return {
          code,
          quantity,
          product_id: product.id,
          product_name: product.name,
          valid: true,
        };
      });

      return parsedItems;
    } finally {
      setIsProcessing(false);
    }
  };

  // Delete movement
  const deleteMovement = useMutation({
    mutationFn: async (movement: StockMovement) => {
      // Reverse the stock change
      const stockChange = movement.movement_type === 'entrada' 
        ? -movement.quantity 
        : movement.quantity;

      const { data: product } = await supabase
        .from('products')
        .select('current_stock')
        .eq('id', movement.product_id)
        .single();

      const newStock = Math.max(0, (product?.current_stock || 0) + stockChange);

      await supabase
        .from('products')
        .update({ current_stock: newStock })
        .eq('id', movement.product_id);

      // Delete the movement
      const { error } = await supabase
        .from('stock_movements')
        .delete()
        .eq('id', movement.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast({
        title: 'Movimento anulado',
        description: 'O movimento foi anulado e o stock foi revertido.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao anular movimento',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    movements,
    isLoading,
    isProcessing,
    registerMovement,
    registerBulkMovements,
    parseStockFile,
    deleteMovement,
  };
}
