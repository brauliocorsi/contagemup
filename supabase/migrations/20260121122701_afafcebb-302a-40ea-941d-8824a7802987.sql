-- Update the sync_product_stock function to calculate complete sets
-- A complete set = minimum quantity across all colis numbers for a product
CREATE OR REPLACE FUNCTION public.sync_product_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  affected_product_id uuid;
  new_stock integer;
  product_total_colis integer;
  coli_qty integer;
  min_qty integer;
  i integer;
BEGIN
  -- Determine which product was affected
  IF TG_OP = 'DELETE' THEN
    affected_product_id := OLD.product_id;
  ELSE
    affected_product_id := NEW.product_id;
  END IF;

  -- Get the product's total_colis
  SELECT total_colis INTO product_total_colis
  FROM products
  WHERE id = affected_product_id;

  -- If product not found or has only 1 coli, use simple sum
  IF product_total_colis IS NULL OR product_total_colis <= 1 THEN
    SELECT COALESCE(SUM(quantity), 0)
    INTO new_stock
    FROM counts
    WHERE product_id = affected_product_id;
  ELSE
    -- Calculate complete sets: minimum quantity across all colis numbers
    min_qty := NULL;
    
    FOR i IN 1..product_total_colis LOOP
      SELECT COALESCE(SUM(quantity), 0)
      INTO coli_qty
      FROM counts
      WHERE product_id = affected_product_id
        AND colis_number = i;
      
      IF min_qty IS NULL OR coli_qty < min_qty THEN
        min_qty := coli_qty;
      END IF;
    END LOOP;
    
    new_stock := COALESCE(min_qty, 0);
  END IF;

  -- Update the product's current_stock
  UPDATE products
  SET current_stock = new_stock,
      updated_at = now()
  WHERE id = affected_product_id;

  -- For UPDATE, also check if product_id changed (moved count to different product)
  IF TG_OP = 'UPDATE' AND OLD.product_id IS DISTINCT FROM NEW.product_id THEN
    -- Recalculate for the old product
    SELECT total_colis INTO product_total_colis
    FROM products
    WHERE id = OLD.product_id;

    IF product_total_colis IS NULL OR product_total_colis <= 1 THEN
      SELECT COALESCE(SUM(quantity), 0)
      INTO new_stock
      FROM counts
      WHERE product_id = OLD.product_id;
    ELSE
      min_qty := NULL;
      
      FOR i IN 1..product_total_colis LOOP
        SELECT COALESCE(SUM(quantity), 0)
        INTO coli_qty
        FROM counts
        WHERE product_id = OLD.product_id
          AND colis_number = i;
        
        IF min_qty IS NULL OR coli_qty < min_qty THEN
          min_qty := coli_qty;
        END IF;
      END LOOP;
      
      new_stock := COALESCE(min_qty, 0);
    END IF;

    UPDATE products
    SET current_stock = new_stock,
        updated_at = now()
    WHERE id = OLD.product_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Now recalculate all existing products' stock to use the new logic
-- This updates products with multiple colis to show complete sets
DO $$
DECLARE
  prod RECORD;
  new_stock integer;
  coli_qty integer;
  min_qty integer;
  i integer;
BEGIN
  FOR prod IN SELECT id, total_colis FROM products LOOP
    IF prod.total_colis <= 1 THEN
      SELECT COALESCE(SUM(quantity), 0)
      INTO new_stock
      FROM counts
      WHERE product_id = prod.id;
    ELSE
      min_qty := NULL;
      
      FOR i IN 1..prod.total_colis LOOP
        SELECT COALESCE(SUM(quantity), 0)
        INTO coli_qty
        FROM counts
        WHERE product_id = prod.id
          AND colis_number = i;
        
        IF min_qty IS NULL OR coli_qty < min_qty THEN
          min_qty := coli_qty;
        END IF;
      END LOOP;
      
      new_stock := COALESCE(min_qty, 0);
    END IF;

    UPDATE products
    SET current_stock = new_stock,
        updated_at = now()
    WHERE id = prod.id;
  END LOOP;
END $$;