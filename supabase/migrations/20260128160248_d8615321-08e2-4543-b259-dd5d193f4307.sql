-- Adicionar campo damaged_stock à tabela products
ALTER TABLE products 
ADD COLUMN damaged_stock integer NOT NULL DEFAULT 0;

-- Criar tabela product_damages
CREATE TABLE product_damages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1,
  colis_number integer,
  damage_type text NOT NULL,
  description text,
  location text,
  pallet_number text,
  reported_by uuid,
  status text NOT NULL DEFAULT 'active',
  resolved_at timestamp with time zone,
  resolution_type text,
  resolution_notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- RLS Policies
ALTER TABLE product_damages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view damages" 
  ON product_damages FOR SELECT 
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create damages" 
  ON product_damages FOR INSERT 
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update damages" 
  ON product_damages FOR UPDATE 
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete damages" 
  ON product_damages FOR DELETE 
  USING (auth.uid() IS NOT NULL);

-- Trigger para updated_at
CREATE TRIGGER update_product_damages_updated_at
  BEFORE UPDATE ON product_damages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();