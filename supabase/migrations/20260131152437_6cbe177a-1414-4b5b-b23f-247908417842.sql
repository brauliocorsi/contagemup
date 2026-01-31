-- Índices para melhorar performance das queries mais frequentes

-- Índice para buscar counts por produto e sessão (usado em muitas views)
CREATE INDEX IF NOT EXISTS idx_counts_product_session 
  ON counts(product_id, session_id);

-- Índice para ordenar counts por data dentro de uma sessão
CREATE INDEX IF NOT EXISTS idx_counts_session_counted_at 
  ON counts(session_id, counted_at DESC);

-- Índice para filtrar produtos por categoria
CREATE INDEX IF NOT EXISTS idx_products_category 
  ON products(category);

-- Índice para pesquisar encomendas por número (usado nas saídas)
CREATE INDEX IF NOT EXISTS idx_stock_order_numbers_order_number 
  ON stock_order_numbers(order_number);

-- Índice para buscar order numbers por produto
CREATE INDEX IF NOT EXISTS idx_stock_order_numbers_product_id 
  ON stock_order_numbers(product_id);

-- Índice para picking items por produto (usado no cálculo de stock)
CREATE INDEX IF NOT EXISTS idx_picking_items_product_id 
  ON picking_items(product_id);

-- Índice para stock_movements por produto e tipo
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_type 
  ON stock_movements(product_id, movement_type);

-- Índice para count_logs por sessão e produto
CREATE INDEX IF NOT EXISTS idx_count_logs_session_product 
  ON count_logs(session_id, product_id);