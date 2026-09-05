/**
 * Função central de resolução de leituras do scanner.
 *
 * Deixa de haver adivinhação por contexto: cada etiqueta traz um prefixo.
 *   LOC-<código>   → localização de armazém
 *   VIA-<matrícula|código> → viatura
 *   ROTA-<código>  → rota
 *   NOTA-<número>  → nota de encomenda / nota de entrega
 *   CMD-<...>      → comando operacional (folha de comandos)
 *   qualquer outro → produto (product_barcodes, products.barcode, código, coli)
 *
 * Compatibilidade: um código sem prefixo que corresponda exatamente ao código de
 * uma localização existente continua a ser aceite como localização, para não
 * invalidar as etiquetas já impressas.
 */
import { supabase } from '@/integrations/supabase/client';
import { parseCommand, type ParsedCommand } from './commands';
import type { Product } from '@/types/stock';

export type ScanKind = 'command' | 'location' | 'vehicle' | 'route' | 'note' | 'product' | 'unknown';

export interface ScanLocation {
  id: string;
  code: string;
  location_type: string | null;
}

export interface ScanVehicle {
  id: string;
  code: string;
  plate: string | null;
}

export interface ScanRoute {
  id: string;
  name: string | null;
  barcode: string | null;
}

export interface ScanNote {
  id: string;
  order_number: string;
  status: string | null;
  client_name?: string | null;
}

export interface ResolvedScan {
  kind: ScanKind;
  /** Código lido, já limpo e sem prefixo. */
  value: string;
  raw: string;
  /** Número do coli quando a etiqueta é CODIGO-C2. */
  colis?: number;
  command?: ParsedCommand;
  location?: ScanLocation;
  vehicle?: ScanVehicle;
  route?: ScanRoute;
  note?: ScanNote;
  product?: Product;
  /** Vários produtos com o mesmo código/nome. */
  products?: Product[];
  /** Mensagem em português a mostrar quando nada foi encontrado. */
  message?: string;
}

const clean = (raw: string) => (raw || '').trim();

function stripPrefix(value: string, prefix: string) {
  return value.slice(prefix.length).trim();
}

/** Separa o sufixo de coli (CODIGO-C2). */
function splitColis(value: string): { base: string; colis?: number } {
  const m = value.match(/^(.+)-C(\d+)$/i);
  if (!m) return { base: value };
  return { base: m[1], colis: Number(m[2]) };
}

async function findLocation(code: string): Promise<ScanLocation | null> {
  const { data } = await supabase
    .from('warehouse_locations')
    .select('id, code, location_type')
    .ilike('code', code)
    .limit(1);
  return (data?.[0] as ScanLocation) ?? null;
}

async function findVehicle(code: string): Promise<ScanVehicle | null> {
  const { data } = await supabase
    .from('warehouse_locations')
    .select('id, code, plate')
    .eq('location_type', 'transport')
    .or(`code.ilike.${code},plate.ilike.${code}`)
    .limit(1);
  return (data?.[0] as ScanVehicle) ?? null;
}

async function findRoute(code: string): Promise<ScanRoute | null> {
  const withPrefix = code.toUpperCase().startsWith('ROTA-') ? code : `ROTA-${code}`;
  const { data } = await supabase
    .from('route_schedules')
    .select('id, name, barcode')
    .or(`barcode.ilike.${withPrefix},barcode.ilike.${code},id.eq.${isUuid(code) ? code : '00000000-0000-0000-0000-000000000000'}`)
    .limit(1);
  return (data?.[0] as ScanRoute) ?? null;
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

async function findNote(code: string): Promise<ScanNote | null> {
  const { data } = await supabase
    .from('delivery_notes')
    .select('id, order_number, status, client_name')
    .ilike('order_number', code)
    .limit(1);
  return (data?.[0] as ScanNote) ?? null;
}

async function findProducts(code: string): Promise<Product[]> {
  const byCode = await supabase.from('products').select('*').ilike('code', code).limit(5);
  if (byCode.data?.length) return byCode.data as Product[];

  const byBarcode = await supabase.from('products').select('*').eq('barcode', code).limit(5);
  if (byBarcode.data?.length) return byBarcode.data as Product[];

  const alias = await supabase.from('product_barcodes').select('product_id').eq('barcode', code).limit(5);
  if (alias.data?.length) {
    const ids = alias.data.map((a) => a.product_id);
    const res = await supabase.from('products').select('*').in('id', ids);
    if (res.data?.length) return res.data as Product[];
  }

  const bySupplier = await supabase.from('products').select('*').eq('supplier_code', code).limit(5);
  if (bySupplier.data?.length) return bySupplier.data as Product[];

  const byName = await supabase.from('products').select('*').ilike('name', `%${code}%`).limit(10);
  return (byName.data ?? []) as Product[];
}

/**
 * Resolve uma leitura e devolve o tipo e a entidade encontrada.
 * Todos os módulos do scanner devem usar esta função.
 */
export async function resolveScan(raw: string): Promise<ResolvedScan> {
  const value = clean(raw);
  if (!value) return { kind: 'unknown', value: '', raw, message: 'Leitura vazia' };

  const command = parseCommand(value);
  if (command) return { kind: 'command', value, raw, command };

  const upper = value.toUpperCase();

  if (upper.startsWith('LOC-')) {
    const code = stripPrefix(value, 'LOC-');
    const location = await findLocation(code);
    return location
      ? { kind: 'location', value: location.code, raw, location }
      : { kind: 'unknown', value: code, raw, message: `Localização desconhecida: ${code}` };
  }

  if (upper.startsWith('VIA-')) {
    const code = stripPrefix(value, 'VIA-');
    const vehicle = await findVehicle(code);
    return vehicle
      ? { kind: 'vehicle', value: vehicle.plate || vehicle.code, raw, vehicle }
      : { kind: 'unknown', value: code, raw, message: `Viatura desconhecida: ${code}` };
  }

  if (upper.startsWith('ROTA-')) {
    const code = stripPrefix(value, 'ROTA-');
    const route = await findRoute(code);
    return route
      ? { kind: 'route', value: route.barcode || code, raw, route }
      : { kind: 'unknown', value: code, raw, message: `Rota desconhecida: ${code}` };
  }

  if (upper.startsWith('NOTA-')) {
    const code = stripPrefix(value, 'NOTA-');
    const note = await findNote(code);
    return note
      ? { kind: 'note', value: note.order_number || code, raw, note }
      : { kind: 'unknown', value: code, raw, message: `Nota de encomenda desconhecida: ${code}` };
  }

  // Sem prefixo: compatibilidade com as etiquetas de localização já impressas.
  const legacyLocation = await findLocation(value);
  if (legacyLocation) return { kind: 'location', value: legacyLocation.code, raw, location: legacyLocation };

  const { base, colis } = splitColis(value);
  const products = await findProducts(base);
  if (products.length > 0) {
    return { kind: 'product', value: base, raw, colis, product: products[0], products };
  }

  return { kind: 'unknown', value: base, raw, colis, message: `Código desconhecido: ${base}` };
}

/** Etiquetas geradas de agora em diante levam sempre prefixo. */
export const scanPrefix = {
  location: (code: string) => withPrefix(code, 'LOC-'),
  vehicle: (code: string) => withPrefix(code, 'VIA-'),
  route: (code: string) => withPrefix(code, 'ROTA-'),
  note: (code: string) => withPrefix(code, 'NOTA-'),
};

function withPrefix(code: string, prefix: string) {
  const c = clean(code).toUpperCase();
  return c.startsWith(prefix) ? c : `${prefix}${c}`;
}
