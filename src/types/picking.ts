import { MovementItem } from '@/hooks/useStockMovements';

// Detail for a single coli in a specific location
export interface ColisPickingDetail {
  colis_number: number;
  colis_name: string | null; // From category colis_names
  quantity: number;
  location: string | null;
  requires_forklift: boolean;
  level_name: string | null;
  aisle_name: string | null;
  position_in_aisle: number;
}

// Extended picking item with detailed colis information
export interface PickingItemDetailed extends MovementItem {
  total_colis: number;
  category: string;
  // All colis details for this product
  colisDetails: ColisPickingDetail[];
  // Summary flags
  hasMultipleLocations: boolean;
  hasForkliftRequired: boolean;
  uniqueLocations: string[];
}

// Flattened row for PDF export - one row per coli
export interface PickingPDFRow {
  productIndex: number;
  product_code: string;
  product_name: string;
  colis_label: string; // "1/3", "2/3", etc.
  colis_name: string | null;
  quantity: number;
  location: string | null;
  level_name: string | null;
  aisle_name: string | null;
  requires_forklift: boolean;
}
