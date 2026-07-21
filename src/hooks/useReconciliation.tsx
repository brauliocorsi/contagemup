import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Reconciliation, ReconciliationItem, CSVImportRow, CSVParseResult, CSVValidationError } from '@/types/reconciliation';
import { ProductWithCounts } from '@/types/stock';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from './useAuth';
import { loadXLSX } from '@/lib/lazyXlsx';
// Column aliases for auto-detection
const COLUMN_ALIASES = {
  code: ['codigo', 'code', 'código', 'cod', 'sku', 'ref', 'referencia', 'referência', 'product_code', 'productcode'],
  name: ['nome', 'name', 'produto', 'product', 'description', 'descricao', 'descrição', 'designacao', 'designação'],
  quantity: ['quantidade', 'quantity', 'qty', 'qtd', 'stock', 'qtde', 'quant', 'qnt', 'un', 'unidades']
};

export interface ColumnMapping {
  code: string | null;
  name: string | null;
  quantity: string | null;
}

export interface FileParseResult {
  rows: CSVImportRow[];
  errors: CSVValidationError[];
  headerError: string | null;
  headers: string[];
  detectedMapping: ColumnMapping;
  rawData: Record<string, unknown>[];
}

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

  const detectColumnMapping = (headers: string[]): ColumnMapping => {
    const mapping: ColumnMapping = { code: null, name: null, quantity: null };
    const normalizedHeaders = headers.map(h => h.toLowerCase().trim());

    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
      for (const alias of aliases) {
        const index = normalizedHeaders.findIndex(h => h.includes(alias));
        if (index !== -1 && mapping[field as keyof ColumnMapping] === null) {
          mapping[field as keyof ColumnMapping] = headers[index];
          break;
        }
      }
    }

    return mapping;
  };

  // Security constants
  const MAX_CODE_LENGTH = 100;
  const MAX_NAME_LENGTH = 300;
  const MAX_QUANTITY = 1000000;

  // Security: Sanitize value to prevent CSV injection
  const sanitizeValue = (value: string): string => {
    if (!value) return '';
    if (/^[=+\-@\t\r]/.test(value)) {
      return "'" + value;
    }
    return value;
  };

  const parseFileWithMapping = (
    rawData: Record<string, unknown>[],
    mapping: ColumnMapping
  ): { rows: CSVImportRow[]; errors: CSVValidationError[] } => {
    const rows: CSVImportRow[] = [];
    const errors: CSVValidationError[] = [];
    const seenCodes = new Set<string>();

    if (!mapping.code || !mapping.quantity) {
      return { rows: [], errors: [] };
    }

    rawData.forEach((row, index) => {
      const lineErrors: string[] = [];
      const lineNumber = index + 2; // +2 because of header row and 1-based indexing

      // Security: Sanitize and validate fields
      const rawCode = String(row[mapping.code!] || '').trim();
      const code = sanitizeValue(rawCode).substring(0, MAX_CODE_LENGTH);
      const quantityStr = String(row[mapping.quantity!] || '').trim();
      const quantity = parseInt(quantityStr, 10);
      const rawName = mapping.name ? String(row[mapping.name] || '').trim() : undefined;
      const name = rawName ? sanitizeValue(rawName).substring(0, MAX_NAME_LENGTH) : undefined;

      // Validate code
      if (!code) {
        lineErrors.push('Código em falta');
      } else if (code.length > MAX_CODE_LENGTH) {
        lineErrors.push(`Código muito longo (máx. ${MAX_CODE_LENGTH} caracteres)`);
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
      } else if (quantity > MAX_QUANTITY) {
        lineErrors.push(`Quantidade excede máximo (${MAX_QUANTITY.toLocaleString()})`);
      }

      if (lineErrors.length > 0) {
        errors.push({
          line: lineNumber,
          content: JSON.stringify(row).substring(0, 80),
          errors: lineErrors
        });
      } else if (code) {
        seenCodes.add(code.toLowerCase());
        rows.push({ code, name, quantity: Math.min(quantity, MAX_QUANTITY) });
      }
    });

    return { rows, errors };
  };

  // Security: File limits
  const MAX_ROWS = 10000;

  const parseXLSX = async (data: ArrayBuffer): FileParseResult => {
      const XLSX = await loadXLSX();
    const result: FileParseResult = {
      rows: [],
      errors: [],
      headerError: null,
      headers: [],
      detectedMapping: { code: null, name: null, quantity: null },
      rawData: []
    };

    try {
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      
      const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });
      
      if (jsonData.length === 0) {
        result.headerError = 'O ficheiro está vazio ou não contém dados';
        return result;
      }

      // Security: Row limit validation
      if (jsonData.length > MAX_ROWS) {
        result.headerError = `O ficheiro contém mais de ${MAX_ROWS.toLocaleString()} linhas. Por favor, divida em ficheiros menores.`;
        return result;
      }

      // Get headers from the first row
      const headers = Object.keys(jsonData[0] || {});
      result.headers = headers;
      result.rawData = jsonData;

      // Detect column mapping
      const detectedMapping = detectColumnMapping(headers);
      result.detectedMapping = detectedMapping;

      if (!detectedMapping.code) {
        result.headerError = 'Coluna de código não detetada automaticamente. Por favor, mapeie as colunas manualmente.';
        return result;
      }

      if (!detectedMapping.quantity) {
        result.headerError = 'Coluna de quantidade não detetada automaticamente. Por favor, mapeie as colunas manualmente.';
        return result;
      }

      const { rows, errors } = parseFileWithMapping(jsonData, detectedMapping);
      result.rows = rows;
      result.errors = errors;

    } catch (err) {
      console.error('Error parsing XLSX:', err);
      result.headerError = 'Erro ao ler o ficheiro Excel. Verifique se o formato está correto.';
    }

    return result;
  };

  const parseCSV = (content: string): FileParseResult => {
    const result: FileParseResult = {
      rows: [],
      errors: [],
      headerError: null,
      headers: [],
      detectedMapping: { code: null, name: null, quantity: null },
      rawData: []
    };

    const lines = content.trim().split('\n');
    if (lines.length < 2) {
      result.headerError = 'O ficheiro está vazio ou não contém dados';
      return result;
    }

    // Security: Row limit validation
    if (lines.length > MAX_ROWS + 1) { // +1 for header
      result.headerError = `O ficheiro contém mais de ${MAX_ROWS.toLocaleString()} linhas. Por favor, divida em ficheiros menores.`;
      return result;
    }

    // Parse header
    const delimiter = lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : ',';
    const headers = lines[0].split(delimiter).map(h => h.trim());
    result.headers = headers;

    // Convert CSV to JSON-like format
    const rawData: Record<string, unknown>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const lineContent = lines[i].trim();
      if (!lineContent) continue;
      
      const values = lineContent.split(delimiter);
      const row: Record<string, unknown> = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx]?.trim() || '';
      });
      rawData.push(row);
    }
    result.rawData = rawData;

    // Detect column mapping
    const detectedMapping = detectColumnMapping(headers);
    result.detectedMapping = detectedMapping;

    if (!detectedMapping.code) {
      result.headerError = 'Coluna de código não detetada automaticamente. Por favor, mapeie as colunas manualmente.';
      return result;
    }

    if (!detectedMapping.quantity) {
      result.headerError = 'Coluna de quantidade não detetada automaticamente. Por favor, mapeie as colunas manualmente.';
      return result;
    }

    const { rows, errors } = parseFileWithMapping(rawData, detectedMapping);
    result.rows = rows;
    result.errors = errors;

    return result;
  };

  const reParseWithMapping = (rawData: Record<string, unknown>[], mapping: ColumnMapping): FileParseResult => {
    const result: FileParseResult = {
      rows: [],
      errors: [],
      headerError: null,
      headers: Object.keys(rawData[0] || {}),
      detectedMapping: mapping,
      rawData
    };

    if (!mapping.code) {
      result.headerError = 'Por favor, selecione a coluna para o código do produto.';
      return result;
    }

    if (!mapping.quantity) {
      result.headerError = 'Por favor, selecione a coluna para a quantidade.';
      return result;
    }

    const { rows, errors } = parseFileWithMapping(rawData, mapping);
    result.rows = rows;
    result.errors = errors;

    return result;
  };

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