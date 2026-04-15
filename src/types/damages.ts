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

export const RESOLUTION_TYPES = [
  'Reparado',
  'Descartado',
  'Devolvido ao fornecedor',
  'Vendido com desconto',
  'Outro'
] as const;

export type ResolutionType = typeof RESOLUTION_TYPES[number];

export interface ProductDamage {
  id: string;
  product_id: string;
  quantity: number;
  colis_number: number | null;
  damage_type: string;
  description: string | null;
  location: string | null;
  pallet_number: string | null;
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
