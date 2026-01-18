export interface Product {
  id: string;
  code: string;
  name: string;
  total_colis: number;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface CountingSession {
  id: string;
  name: string;
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
  counted_by: string | null;
  counted_at: string;
  updated_at: string;
}

export interface ProductWithCounts extends Product {
  counts: Count[];
  completeSets: number;
  incompleteColis: { colis_number: number; quantity: number }[];
  excessColis: { colis_number: number; excess: number }[];
  status: 'complete' | 'incomplete' | 'excess' | 'not_counted';
}

export interface Profile {
  id: string;
  user_id: string;
  name: string;
  role: 'admin' | 'operator';
  created_at: string;
  updated_at: string;
}
