
-- Criar função para recalcular stock considerando TODOS os movimentos
-- Stock = Base Counts + Entradas (stock_movements) - Picking (picking_items)

CREATE OR REPLACE FUNCTION public.recalculate_all_stock()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  product_row RECORD;
  base_stock integer;
  entradas integer;
  picking integer;
  new_stock integer;
  coli_qty integer;
  min_qty integer;
  i integer;
BEGIN
  FOR product_row IN SELECT id, total_colis FROM products LOOP
    -- Calcular stock base dos counts
    IF product_row.total_colis <= 1 THEN
      SELECT COALESCE(SUM(quantity), 0) INTO base_stock
      FROM counts WHERE product_id = product_row.id;
    ELSE
      min_qty := NULL;
      FOR i IN 1..product_row.total_colis LOOP
        SELECT COALESCE(SUM(quantity), 0) INTO coli_qty
        FROM counts
        WHERE product_id = product_row.id AND colis_number = i;
        
        IF min_qty IS NULL OR coli_qty < min_qty THEN
          min_qty := coli_qty;
        END IF;
      END LOOP;
      base_stock := COALESCE(min_qty, 0);
    END IF;
    
    -- Somar entradas de stock_movements
    SELECT COALESCE(SUM(quantity), 0) INTO entradas
    FROM stock_movements
    WHERE product_id = product_row.id AND movement_type = 'entrada';
    
    -- Subtrair picking
    SELECT COALESCE(SUM(quantity), 0) INTO picking
    FROM picking_items
    WHERE product_id = product_row.id;
    
    -- Calcular novo stock (nunca negativo)
    new_stock := GREATEST(0, base_stock + entradas - picking);
    
    -- Actualizar produto
    UPDATE products
    SET current_stock = new_stock, updated_at = now()
    WHERE id = product_row.id;
  END LOOP;
END;
$$;

-- Criar trigger para stock_movements
CREATE OR REPLACE FUNCTION public.sync_stock_on_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  affected_product_id uuid;
  base_stock integer;
  entradas integer;
  picking integer;
  new_stock integer;
  product_total_colis integer;
  coli_qty integer;
  min_qty integer;
  i integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    affected_product_id := OLD.product_id;
  ELSE
    affected_product_id := NEW.product_id;
  END IF;

  -- Obter total_colis do produto
  SELECT total_colis INTO product_total_colis
  FROM products WHERE id = affected_product_id;

  -- Calcular stock base dos counts
  IF product_total_colis IS NULL OR product_total_colis <= 1 THEN
    SELECT COALESCE(SUM(quantity), 0) INTO base_stock
    FROM counts WHERE product_id = affected_product_id;
  ELSE
    min_qty := NULL;
    FOR i IN 1..product_total_colis LOOP
      SELECT COALESCE(SUM(quantity), 0) INTO coli_qty
      FROM counts
      WHERE product_id = affected_product_id AND colis_number = i;
      
      IF min_qty IS NULL OR coli_qty < min_qty THEN
        min_qty := coli_qty;
      END IF;
    END LOOP;
    base_stock := COALESCE(min_qty, 0);
  END IF;

  -- Somar entradas
  SELECT COALESCE(SUM(quantity), 0) INTO entradas
  FROM stock_movements
  WHERE product_id = affected_product_id AND movement_type = 'entrada';

  -- Subtrair picking
  SELECT COALESCE(SUM(quantity), 0) INTO picking
  FROM picking_items
  WHERE product_id = affected_product_id;

  -- Novo stock
  new_stock := GREATEST(0, base_stock + entradas - picking);

  UPDATE products
  SET current_stock = new_stock, updated_at = now()
  WHERE id = affected_product_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Criar trigger para picking_items
CREATE OR REPLACE FUNCTION public.sync_stock_on_picking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  affected_product_id uuid;
  base_stock integer;
  entradas integer;
  picking integer;
  new_stock integer;
  product_total_colis integer;
  coli_qty integer;
  min_qty integer;
  i integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    affected_product_id := OLD.product_id;
  ELSE
    affected_product_id := NEW.product_id;
  END IF;

  -- Se product_id for NULL, não fazer nada
  IF affected_product_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Obter total_colis do produto
  SELECT total_colis INTO product_total_colis
  FROM products WHERE id = affected_product_id;

  -- Calcular stock base dos counts
  IF product_total_colis IS NULL OR product_total_colis <= 1 THEN
    SELECT COALESCE(SUM(quantity), 0) INTO base_stock
    FROM counts WHERE product_id = affected_product_id;
  ELSE
    min_qty := NULL;
    FOR i IN 1..product_total_colis LOOP
      SELECT COALESCE(SUM(quantity), 0) INTO coli_qty
      FROM counts
      WHERE product_id = affected_product_id AND colis_number = i;
      
      IF min_qty IS NULL OR coli_qty < min_qty THEN
        min_qty := coli_qty;
      END IF;
    END LOOP;
    base_stock := COALESCE(min_qty, 0);
  END IF;

  -- Somar entradas
  SELECT COALESCE(SUM(quantity), 0) INTO entradas
  FROM stock_movements
  WHERE product_id = affected_product_id AND movement_type = 'entrada';

  -- Subtrair picking
  SELECT COALESCE(SUM(quantity), 0) INTO picking
  FROM picking_items
  WHERE product_id = affected_product_id;

  -- Novo stock
  new_stock := GREATEST(0, base_stock + entradas - picking);

  UPDATE products
  SET current_stock = new_stock, updated_at = now()
  WHERE id = affected_product_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Actualizar trigger sync_product_stock para usar a mesma lógica
CREATE OR REPLACE FUNCTION public.sync_product_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  affected_product_id uuid;
  base_stock integer;
  entradas integer;
  picking integer;
  new_stock integer;
  product_total_colis integer;
  coli_qty integer;
  min_qty integer;
  i integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    affected_product_id := OLD.product_id;
  ELSE
    affected_product_id := NEW.product_id;
  END IF;

  -- Obter total_colis do produto
  SELECT total_colis INTO product_total_colis
  FROM products WHERE id = affected_product_id;

  -- Calcular stock base dos counts
  IF product_total_colis IS NULL OR product_total_colis <= 1 THEN
    SELECT COALESCE(SUM(quantity), 0) INTO base_stock
    FROM counts WHERE product_id = affected_product_id;
  ELSE
    min_qty := NULL;
    FOR i IN 1..product_total_colis LOOP
      SELECT COALESCE(SUM(quantity), 0) INTO coli_qty
      FROM counts
      WHERE product_id = affected_product_id AND colis_number = i;
      
      IF min_qty IS NULL OR coli_qty < min_qty THEN
        min_qty := coli_qty;
      END IF;
    END LOOP;
    base_stock := COALESCE(min_qty, 0);
  END IF;

  -- Somar entradas de stock_movements
  SELECT COALESCE(SUM(quantity), 0) INTO entradas
  FROM stock_movements
  WHERE product_id = affected_product_id AND movement_type = 'entrada';

  -- Subtrair picking
  SELECT COALESCE(SUM(quantity), 0) INTO picking
  FROM picking_items
  WHERE product_id = affected_product_id;

  -- Novo stock (nunca negativo)
  new_stock := GREATEST(0, base_stock + entradas - picking);

  UPDATE products
  SET current_stock = new_stock, updated_at = now()
  WHERE id = affected_product_id;

  -- Para UPDATE, verificar se mudou de produto
  IF TG_OP = 'UPDATE' AND OLD.product_id IS DISTINCT FROM NEW.product_id THEN
    -- Recalcular para o produto antigo também
    SELECT total_colis INTO product_total_colis
    FROM products WHERE id = OLD.product_id;

    IF product_total_colis IS NULL OR product_total_colis <= 1 THEN
      SELECT COALESCE(SUM(quantity), 0) INTO base_stock
      FROM counts WHERE product_id = OLD.product_id;
    ELSE
      min_qty := NULL;
      FOR i IN 1..product_total_colis LOOP
        SELECT COALESCE(SUM(quantity), 0) INTO coli_qty
        FROM counts
        WHERE product_id = OLD.product_id AND colis_number = i;
        
        IF min_qty IS NULL OR coli_qty < min_qty THEN
          min_qty := coli_qty;
        END IF;
      END LOOP;
      base_stock := COALESCE(min_qty, 0);
    END IF;

    SELECT COALESCE(SUM(quantity), 0) INTO entradas
    FROM stock_movements
    WHERE product_id = OLD.product_id AND movement_type = 'entrada';

    SELECT COALESCE(SUM(quantity), 0) INTO picking
    FROM picking_items
    WHERE product_id = OLD.product_id;

    new_stock := GREATEST(0, base_stock + entradas - picking);

    UPDATE products
    SET current_stock = new_stock, updated_at = now()
    WHERE id = OLD.product_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Criar triggers para stock_movements e picking_items
DROP TRIGGER IF EXISTS trigger_sync_stock_on_movement ON stock_movements;
CREATE TRIGGER trigger_sync_stock_on_movement
  AFTER INSERT OR UPDATE OR DELETE ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION sync_stock_on_movement();

DROP TRIGGER IF EXISTS trigger_sync_stock_on_picking ON picking_items;
CREATE TRIGGER trigger_sync_stock_on_picking
  AFTER INSERT OR UPDATE OR DELETE ON picking_items
  FOR EACH ROW EXECUTE FUNCTION sync_stock_on_picking();

-- Executar recálculo para todos os produtos agora
SELECT recalculate_all_stock();
