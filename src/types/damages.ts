export const DAMAGE_TYPES = [
  'Quebra',
  'Amassado',
  'Risco/Arranhão',
  'Molhado/Humidade',
  'Sujeira',
  'Peça em falta',
  'Embalagem danificada',
  'Defeito de fábrica',
  'Outro'
] as const;

export type DamageType = typeof DAMAGE_TYPES[number];

export const QUARANTINE_LOCATION = 'QUARENTENA';
export const RETURNS_QUARANTINE_LOCATION = 'QUARENTENA-DEV';

export const RESOLUTION_OPTIONS = [
  {
    value: 'recuperado',
    label: 'Recuperado',
    description: 'Volta para a localização de origem',
    needsDestination: false,
    needsSupplierRef: false,
  },
  {
    value: 'abatido',
    label: 'Abatido',
    description: 'Sai definitivamente do armazém',
    needsDestination: false,
    needsSupplierRef: false,
  },
  {
    value: 'devolvido_fornecedor',
    label: 'Devolvido ao fornecedor',
    description: 'Sai com referência do fornecedor',
    needsDestination: false,
    needsSupplierRef: true,
  },
  {
    value: 'vendido_saldo',
    label: 'Vendido em saldo (2.ª escolha)',
    description: 'Volta ao stock numa localização à escolha',
    needsDestination: true,
    needsSupplierRef: false,
  },
] as const;

export const RESOLUTION_TYPES = RESOLUTION_OPTIONS.map((o) => o.value);

export type ResolutionType = typeof RESOLUTION_OPTIONS[number]['value'];

export const RESOLUTION_LABELS: Record<string, string> = Object.fromEntries(
  RESOLUTION_OPTIONS.map((o) => [o.value, o.label])
);


export interface ProductDamage {
  id: string;
  product_id: string;
  quantity: number;
  colis_number: number | null;
  damage_type: string;
  description: string | null;
  location: string | null;
  reported_by: string | null;
  status: 'active' | 'resolved';
  resolved_at: string | null;
  resolution_type: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductDamageWithProduct extends ProductDamage {
  product?: {
    id: string;
    code: string;
    name: string;
    category: string;
    total_colis: number;
  };
}

export interface DamageStats {
  totalActiveDamages: number;
  totalDamagedUnits: number;
  totalResolvedDamages: number;
  byType: Record<string, number>;
  byProduct: Record<string, { count: number; units: number; name: string }>;
}
