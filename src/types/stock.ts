export interface Product {
  id: string;
  code: string;
  name: string;
  category: string;
  total_colis: number;
  description: string | null;
  location: string | null;
  pallet_number: string | null;
  current_stock: number;
  min_stock: number;
  damaged_stock: number;
  created_at: string;
  updated_at: string;
}

export const PRODUCT_CATEGORIES = [
  'Camas',
  'Móveis',
  'Roupeiros',
  'Cadeiras',
  'Mesas',
  'Sofás',
  'Colchões',
  'Estantes',
  'Geral'
] as const;

export type ProductCategory = typeof PRODUCT_CATEGORIES[number];

export interface CountingSession {
  id: string;
  name: string;
  category: string;
  status: 'active' | 'completed' | 'cancelled';
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface Count {
  id: string;
  session_id: string;
  product_id: string;
  colis_number: number;
  quantity: number;
  location: string | null;
  pallet_number: string | null;
  counted_by: string | null;
  counted_at: string;
  updated_at: string;
}

// Represents a single location allocation for a coli
export interface ColisLocationEntry {
  countId: string; // ID of the count record
  quantity: number;
  location: string | null;
  pallet_number: string | null;
}

// Updated ColisDetail to support multiple locations per coli
export interface ColisDetail {
  colis_number: number;
  quantity: number; // Total quantity across all locations
  location: string | null; // Primary location (first one)
  pallet_number: string | null; // Primary pallet (first one)
  // New: Array of all location entries for this coli
  locationEntries: ColisLocationEntry[];
  hasMultipleLocations: boolean;
}

export interface ProductWithCounts extends Product {
  counts: Count[];
  completeSets: number;
  incompleteColis: { colis_number: number; quantity: number }[];
  excessColis: { colis_number: number; excess: number }[];
  missingForNextComplete: { colis_number: number; missing: number }[];
  hasPartialProduct: boolean;
  location: string | null;
  palletNumber: string | null;
  status: 'complete' | 'incomplete' | 'excess' | 'not_counted';
  // Per-coli location/pallet tracking
  colisDetails: ColisDetail[];
  uniqueLocations: string[];
  uniquePallets: string[];
  hasMultipleLocations: boolean;
  hasMultiplePallets: boolean;
}

export interface Profile {
  id: string;
  user_id: string;
  name: string;
  role: 'admin' | 'operator';
  created_at: string;
  updated_at: string;
}

// Distribution entry for split stock dialog
export interface StockDistribution {
  id: string; // Temporary ID for UI purposes
  countId?: string; // Existing count ID (if editing)
  quantity: number;
  location: string;
  pallet_number: string;
}
