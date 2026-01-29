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
  // O trigger sync_stock_on_movement actualiza automaticamente o current_stock
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

      // Insert movement - o trigger actualiza automaticamente o current_stock
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
  // O trigger sync_stock_on_movement actualiza automaticamente o current_stock
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

      // Insert all movements - o trigger actualiza automaticamente o current_stock
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

      // Verificar alertas de stock baixo (apenas para saídas)
      const lowStockProducts: string[] = [];
      const outOfStockProducts: string[] = [];

      if (type === 'saida') {
        // Aguardar um momento para o trigger processar
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Verificar stock actualizado dos produtos
        for (const item of items) {
          const { data: product } = await supabase
            .from('products')
            .select('min_stock, name, current_stock')
            .eq('id', item.product_id)
            .maybeSingle();

          if (product) {
            const minStock = product.min_stock ?? 5;
            if (product.current_stock <= 0) {
              outOfStockProducts.push(product.name);
            } else if (product.current_stock <= minStock) {
              lowStockProducts.push(product.name);
            }
          }
        }
      }

      return { lowStockProducts, outOfStockProducts };
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      
      toast({
        title: 'Movimentos registados',
        description: `${variables.items.length} ${variables.type === 'entrada' ? 'entradas' : 'saídas'} registadas com sucesso.`,
      });

      // Show alerts for low stock products
      if (result?.outOfStockProducts && result.outOfStockProducts.length > 0) {
        setTimeout(() => {
          toast({
            title: '⚠️ Produtos Esgotados!',
            description: result.outOfStockProducts.length === 1
              ? `${result.outOfStockProducts[0]} ficou sem stock!`
              : `${result.outOfStockProducts.length} produtos ficaram sem stock!`,
            variant: 'destructive',
          });
        }, 500);
      }

      if (result?.lowStockProducts && result.lowStockProducts.length > 0) {
        setTimeout(() => {
          toast({
            title: '📉 Stock Baixo',
            description: result.lowStockProducts.length === 1
              ? `${result.lowStockProducts[0]} está com stock baixo`
              : `${result.lowStockProducts.length} produtos estão com stock baixo`,
          });
        }, result?.outOfStockProducts?.length ? 1000 : 500);
      }
    },
    onError: (error) => {
      toast({
        title: 'Erro ao registar movimentos',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Security constants
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  const MAX_ROWS = 10000;
  const MAX_CODE_LENGTH = 100;
  const MAX_QUANTITY = 1000000;

  // Security: Sanitize value to prevent CSV injection
  const sanitizeValue = (value: string): string => {
    if (!value) return '';
    if (/^[=+\-@\t\r]/.test(value)) {
      return "'" + value;
    }
    return value;
  };

  // Parse CSV/Excel file
  const parseStockFile = async (file: File): Promise<ParsedCSVItem[]> => {
    setIsProcessing(true);
    
    try {
      // Security: File size validation
      if (file.size > MAX_FILE_SIZE) {
        throw new Error(`Ficheiro muito grande (máximo ${MAX_FILE_SIZE / (1024 * 1024)}MB)`);
      }

      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);

      if (rows.length === 0) {
        throw new Error('Ficheiro vazio');
      }

      // Security: Row limit validation
      if (rows.length > MAX_ROWS) {
        throw new Error(`Ficheiro contém mais de ${MAX_ROWS.toLocaleString()} linhas`);
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
        // Security: Sanitize and validate code
        const rawCode = String(row[codeKey] || '').trim();
        const code = sanitizeValue(rawCode).substring(0, MAX_CODE_LENGTH);
        
        // Security: Validate quantity with bounds
        const rawQuantity = parseInt(String(row[qtyKey] || '0'), 10);
        const quantity = isNaN(rawQuantity) ? 0 : Math.min(Math.max(0, rawQuantity), MAX_QUANTITY);

        const product = productMap.get(code.toLowerCase());

        if (!code) {
          return { code, quantity, valid: false, error: 'Código vazio' };
        }

        if (isNaN(rawQuantity) || rawQuantity <= 0) {
          return { code, quantity, valid: false, error: 'Quantidade inválida' };
        }

        if (rawQuantity > MAX_QUANTITY) {
          return { code, quantity, valid: false, error: `Quantidade excede máximo (${MAX_QUANTITY.toLocaleString()})` };
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
  // O trigger sync_stock_on_movement actualiza automaticamente o current_stock ao apagar
  const deleteMovement = useMutation({
    mutationFn: async (movement: StockMovement) => {
      // Apagar o movimento - o trigger actualiza automaticamente o current_stock
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
