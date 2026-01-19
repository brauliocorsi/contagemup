export interface Reconciliation {
  id: string;
  session_id: string;
  name: string;
  status: 'pending' | 'validated' | 'cancelled';
  created_by: string | null;
  validated_by: string | null;
  validated_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReconciliationItem {
  id: string;
  reconciliation_id: string;
  product_id: string | null;
  product_code: string;
  product_name: string;
  expected_quantity: number;
  counted_quantity: number;
  difference: number;
  status: 'match' | 'surplus' | 'shortage' | 'not_found';
  notes: string | null;
  location: string | null;
  pallet_number: string | null;
  created_at: string;
  updated_at: string;
}

export interface CSVImportRow {
  code: string;
  name?: string;
  quantity: number;
}

export interface CSVValidationError {
  line: number;
  content: string;
  errors: string[];
}

export interface CSVParseResult {
  rows: CSVImportRow[];
  errors: CSVValidationError[];
  headerError: string | null;
}
