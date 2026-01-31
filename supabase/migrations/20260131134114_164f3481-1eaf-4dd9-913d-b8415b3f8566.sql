-- 1. Adicionar campo requires_order_number à tabela categories
ALTER TABLE categories 
ADD COLUMN requires_order_number boolean NOT NULL DEFAULT false;

-- 2. Criar tabela stock_order_numbers para rastrear encomendas por produto
CREATE TABLE stock_order_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  order_number text NOT NULL,
  colis_status jsonb NOT NULL DEFAULT '{}',
  location text,
  pallet_number text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(product_id, order_number)
);

-- 3. Habilitar RLS
ALTER TABLE stock_order_numbers ENABLE ROW LEVEL SECURITY;

-- 4. Políticas RLS
CREATE POLICY "Authenticated users can view order numbers" ON stock_order_numbers
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert order numbers" ON stock_order_numbers
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update order numbers" ON stock_order_numbers
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete order numbers" ON stock_order_numbers
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- 5. Trigger para updated_at
CREATE TRIGGER update_stock_order_numbers_updated_at
  BEFORE UPDATE ON stock_order_numbers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();