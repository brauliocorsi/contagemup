import type { CSVImportRow, CSVValidationError } from '@/types/reconciliation';
import { loadXLSX } from '@/lib/lazyXlsx';

// Column aliases for auto-detection
const COLUMN_ALIASES = {
  code: ['codigo', 'code', 'código', 'cod', 'sku', 'ref', 'referencia', 'referência', 'product_code', 'productcode'],
  name: ['nome', 'name', 'produto', 'product', 'description', 'descricao', 'descrição', 'designacao', 'designação'],
  quantity: ['quantidade', 'quantity', 'qty', 'qtd', 'stock', 'qtde', 'quant', 'qnt', 'un', 'unidades'],
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

// Security constants
export const MAX_CODE_LENGTH = 100;
export const MAX_NAME_LENGTH = 300;
export const MAX_QUANTITY = 1_000_000;
export const MAX_ROWS = 10_000;

export function detectColumnMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = { code: null, name: null, quantity: null };
  const normalizedHeaders = headers.map((h) => h.toLowerCase().trim());

  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      const index = normalizedHeaders.findIndex((h) => h.includes(alias));
      if (index !== -1 && mapping[field as keyof ColumnMapping] === null) {
        mapping[field as keyof ColumnMapping] = headers[index];
        break;
      }
    }
  }
  return mapping;
}

// Security: Sanitize value to prevent CSV injection
export function sanitizeCsvValue(value: string): string {
  if (!value) return '';
  if (/^[=+\-@\t\r]/.test(value)) return "'" + value;
  return value;
}

export function parseFileWithMapping(
  rawData: Record<string, unknown>[],
  mapping: ColumnMapping,
): { rows: CSVImportRow[]; errors: CSVValidationError[] } {
  const rows: CSVImportRow[] = [];
  const errors: CSVValidationError[] = [];
  const seenCodes = new Set<string>();

  if (!mapping.code || !mapping.quantity) return { rows: [], errors: [] };

  rawData.forEach((row, index) => {
    const lineErrors: string[] = [];
    const lineNumber = index + 2;

    const rawCode = String(row[mapping.code!] || '').trim();
    const code = sanitizeCsvValue(rawCode).substring(0, MAX_CODE_LENGTH);
    const quantityStr = String(row[mapping.quantity!] || '').trim();
    const quantity = parseInt(quantityStr, 10);
    const rawName = mapping.name ? String(row[mapping.name] || '').trim() : undefined;
    const name = rawName ? sanitizeCsvValue(rawName).substring(0, MAX_NAME_LENGTH) : undefined;

    if (!code) lineErrors.push('Código em falta');
    else if (code.length > MAX_CODE_LENGTH) lineErrors.push(`Código muito longo (máx. ${MAX_CODE_LENGTH} caracteres)`);
    else if (seenCodes.has(code.toLowerCase())) lineErrors.push(`Código duplicado: "${code}"`);

    if (!quantityStr) lineErrors.push('Quantidade em falta');
    else if (isNaN(quantity)) lineErrors.push(`Quantidade inválida: "${quantityStr}"`);
    else if (quantity < 0) lineErrors.push('Quantidade não pode ser negativa');
    else if (quantity > MAX_QUANTITY) lineErrors.push(`Quantidade excede máximo (${MAX_QUANTITY.toLocaleString()})`);

    if (lineErrors.length > 0) {
      errors.push({ line: lineNumber, content: JSON.stringify(row).substring(0, 80), errors: lineErrors });
    } else if (code) {
      seenCodes.add(code.toLowerCase());
      rows.push({ code, name, quantity: Math.min(quantity, MAX_QUANTITY) });
    }
  });

  return { rows, errors };
}

function emptyResult(): FileParseResult {
  return {
    rows: [],
    errors: [],
    headerError: null,
    headers: [],
    detectedMapping: { code: null, name: null, quantity: null },
    rawData: [],
  };
}

export async function parseReconciliationXLSX(data: ArrayBuffer): Promise<FileParseResult> {
  const XLSX = await loadXLSX();
  const result = emptyResult();

  try {
    const workbook = XLSX.read(data, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });

    if (jsonData.length === 0) {
      result.headerError = 'O ficheiro está vazio ou não contém dados';
      return result;
    }
    if (jsonData.length > MAX_ROWS) {
      result.headerError = `O ficheiro contém mais de ${MAX_ROWS.toLocaleString()} linhas. Por favor, divida em ficheiros menores.`;
      return result;
    }

    const headers = Object.keys(jsonData[0] || {});
    result.headers = headers;
    result.rawData = jsonData;

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
}

export function parseReconciliationCSV(content: string): FileParseResult {
  const result = emptyResult();

  const lines = content.trim().split('\n');
  if (lines.length < 2) {
    result.headerError = 'O ficheiro está vazio ou não contém dados';
    return result;
  }
  if (lines.length > MAX_ROWS + 1) {
    result.headerError = `O ficheiro contém mais de ${MAX_ROWS.toLocaleString()} linhas. Por favor, divida em ficheiros menores.`;
    return result;
  }

  const delimiter = lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : ',';
  const headers = lines[0].split(delimiter).map((h) => h.trim());
  result.headers = headers;

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
}

export function reParseReconciliationWithMapping(
  rawData: Record<string, unknown>[],
  mapping: ColumnMapping,
): FileParseResult {
  const result: FileParseResult = {
    rows: [],
    errors: [],
    headerError: null,
    headers: Object.keys(rawData[0] || {}),
    detectedMapping: mapping,
    rawData,
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
}
