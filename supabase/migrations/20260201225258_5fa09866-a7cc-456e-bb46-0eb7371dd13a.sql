
-- CORRECÇÃO: O counts deve reflectir o inventário físico real
-- Picking decrementa counts directamente, NÃO é subtraído na fórmula
-- Fórmula final: current_stock = MIN(counts) APENAS

-- Função sync_product_stock - dispara quando counts muda
CREATE OR REPLACE FUNCTION public.sync_product_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  affected_product_id uuid;
  base_stock integer;
  new_stock integer;
  product_total_colis integer;
  category_colis_count integer;
  effective_total_colis integer;
  coli_qty integer;
  min_qty integer;
  i integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    affected_product_id := OLD.product_id;
  ELSE
    affected_product_id := NEW.product_id;
  END IF;

  -- Buscar total_colis do produto E da categoria
  SELECT 
    p.total_colis,
    COALESCE(
      (SELECT count(*)::integer FROM jsonb_object_keys(c.colis_names) as k), 
      0
    )
  INTO product_total_colis, category_colis_count
  FROM products p
  LEFT JOIN categories c ON p.category = c.name
  WHERE p.id = affected_product_id;

  effective_total_colis := GREATEST(
    COALESCE(product_total_colis, 1), 
    COALESCE(category_colis_count, 0)
  );

  -- Calcular stock base dos counts
  IF effective_total_colis <= 1 THEN
    SELECT COALESCE(SUM(quantity), 0) INTO base_stock
    FROM counts WHERE product_id = affected_product_id;
  ELSE
    min_qty := NULL;
    FOR i IN 1..effective_total_colis LOOP
      SELECT COALESCE(SUM(quantity), 0) INTO coli_qty
      FROM counts
      WHERE product_id = affected_product_id AND colis_number = i;
      
      IF min_qty IS NULL OR coli_qty < min_qty THEN
        min_qty := coli_qty;
      END IF;
    END LOOP;
    base_stock := COALESCE(min_qty, 0);
  END IF;

  -- current_stock = base_stock APENAS (picking já está reflectido nos counts)
  new_stock := GREATEST(0, base_stock);

  UPDATE products
  SET current_stock = new_stock, updated_at = now()
  WHERE id = affected_product_id;

  -- Para UPDATE, verificar se mudou de produto
  IF TG_OP = 'UPDATE' AND OLD.product_id IS DISTINCT FROM NEW.product_id THEN
    SELECT 
      p.total_colis,
      COALESCE(
        (SELECT count(*)::integer FROM jsonb_object_keys(c.colis_names) as k), 
        0
      )
    INTO product_total_colis, category_colis_count
    FROM products p
    LEFT JOIN categories c ON p.category = c.name
    WHERE p.id = OLD.product_id;

    effective_total_colis := GREATEST(
      COALESCE(product_total_colis, 1), 
      COALESCE(category_colis_count, 0)
    );

    IF effective_total_colis <= 1 THEN
      SELECT COALESCE(SUM(quantity), 0) INTO base_stock
      FROM counts WHERE product_id = OLD.product_id;
    ELSE
      min_qty := NULL;
      FOR i IN 1..effective_total_colis LOOP
        SELECT COALESCE(SUM(quantity), 0) INTO coli_qty
        FROM counts
        WHERE product_id = OLD.product_id AND colis_number = i;
        
        IF min_qty IS NULL OR coli_qty < min_qty THEN
          min_qty := coli_qty;
        END IF;
      END LOOP;
      base_stock := COALESCE(min_qty, 0);
    END IF;

    new_stock := GREATEST(0, base_stock);

    UPDATE products
    SET current_stock = new_stock, updated_at = now()
    WHERE id = OLD.product_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Função sync_stock_on_movement - dispara quando stock_movements muda
CREATE OR REPLACE FUNCTION public.sync_stock_on_movement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  affected_product_id uuid;
  base_stock integer;
  new_stock integer;
  product_total_colis integer;
  category_colis_count integer;
  effective_total_colis integer;
  coli_qty integer;
  min_qty integer;
  i integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    affected_product_id := OLD.product_id;
  ELSE
    affected_product_id := NEW.product_id;
  END IF;

  -- Buscar total_colis do produto E da categoria
  SELECT 
    p.total_colis,
    COALESCE(
      (SELECT count(*)::integer FROM jsonb_object_keys(c.colis_names) as k), 
      0
    )
  INTO product_total_colis, category_colis_count
  FROM products p
  LEFT JOIN categories c ON p.category = c.name
  WHERE p.id = affected_product_id;

  effective_total_colis := GREATEST(
    COALESCE(product_total_colis, 1), 
    COALESCE(category_colis_count, 0)
  );

  -- Calcular stock base dos counts
  IF effective_total_colis <= 1 THEN
    SELECT COALESCE(SUM(quantity), 0) INTO base_stock
    FROM counts WHERE product_id = affected_product_id;
  ELSE
    min_qty := NULL;
    FOR i IN 1..effective_total_colis LOOP
      SELECT COALESCE(SUM(quantity), 0) INTO coli_qty
      FROM counts
      WHERE product_id = affected_product_id AND colis_number = i;
      
      IF min_qty IS NULL OR coli_qty < min_qty THEN
        min_qty := coli_qty;
      END IF;
    END LOOP;
    base_stock := COALESCE(min_qty, 0);
  END IF;

  -- current_stock = base_stock APENAS
  new_stock := GREATEST(0, base_stock);

  UPDATE products
  SET current_stock = new_stock, updated_at = now()
  WHERE id = affected_product_id;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Função sync_stock_on_picking - dispara quando picking_items muda
-- NOTA: Agora NÃO recalcula stock porque picking decrementa counts directamente
CREATE OR REPLACE FUNCTION public.sync_stock_on_picking()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Não faz nada - o stock é recalculado quando os counts são actualizados
  -- O picking decrementa os counts directamente no código frontend
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Função recalculate_all_stock - recalcula todos os stocks
CREATE OR REPLACE FUNCTION public.recalculate_all_stock()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  product_row RECORD;
  base_stock integer;
  new_stock integer;
  category_colis_count integer;
  effective_total_colis integer;
  coli_qty integer;
  min_qty integer;
  i integer;
BEGIN
  FOR product_row IN 
    SELECT p.id, p.total_colis, p.category
    FROM products p
  LOOP
    -- Buscar colis_count da categoria
    SELECT COALESCE(
      (SELECT count(*)::integer FROM jsonb_object_keys(c.colis_names) as k), 
      0
    )
    INTO category_colis_count
    FROM categories c
    WHERE c.name = product_row.category;

    effective_total_colis := GREATEST(
      COALESCE(product_row.total_colis, 1), 
      COALESCE(category_colis_count, 0)
    );

    -- Calcular stock base dos counts
    IF effective_total_colis <= 1 THEN
      SELECT COALESCE(SUM(quantity), 0) INTO base_stock
      FROM counts WHERE product_id = product_row.id;
    ELSE
      min_qty := NULL;
      FOR i IN 1..effective_total_colis LOOP
        SELECT COALESCE(SUM(quantity), 0) INTO coli_qty
        FROM counts
        WHERE product_id = product_row.id AND colis_number = i;
        
        IF min_qty IS NULL OR coli_qty < min_qty THEN
          min_qty := coli_qty;
        END IF;
      END LOOP;
      base_stock := COALESCE(min_qty, 0);
    END IF;
    
    -- current_stock = base_stock APENAS (sem subtrair picking)
    new_stock := GREATEST(0, base_stock);
    
    -- Actualizar produto
    UPDATE products
    SET current_stock = new_stock, updated_at = now()
    WHERE id = product_row.id;
  END LOOP;
END;
$function$;
