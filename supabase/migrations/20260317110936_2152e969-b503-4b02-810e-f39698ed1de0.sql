
-- For products where category defines more colis than total_colis,
-- ensure counts exist for ALL category colis (not just up to total_colis)
DO $$
DECLARE
  rec RECORD;
  coli integer;
  cat_count integer;
  existing_count_id uuid;
  base_qty integer;
BEGIN
  FOR rec IN
    SELECT p.id, p.total_colis,
      COALESCE((SELECT count(*)::integer FROM jsonb_object_keys(c.colis_names) as k), 0) as cat_colis
    FROM products p
    LEFT JOIN categories c ON p.category = c.name
    WHERE p.current_stock = 0
    AND COALESCE((SELECT count(*)::integer FROM jsonb_object_keys(c.colis_names) as k), 0) > p.total_colis
    AND EXISTS (SELECT 1 FROM counts ct WHERE ct.product_id = p.id AND ct.quantity > 0)
  LOOP
    cat_count := rec.cat_colis;
    
    -- Get the quantity from colis 1 as the base
    SELECT COALESCE(SUM(quantity), 0) INTO base_qty
    FROM counts WHERE product_id = rec.id AND colis_number = 1;
    
    -- Ensure all colis up to cat_count have counts
    FOR coli IN 1..cat_count LOOP
      SELECT id INTO existing_count_id
      FROM counts WHERE product_id = rec.id AND colis_number = coli LIMIT 1;
      
      IF existing_count_id IS NULL THEN
        INSERT INTO counts (product_id, colis_number, quantity, session_id)
        VALUES (rec.id, coli, base_qty, NULL);
      END IF;
    END LOOP;
    
    -- Also update total_colis to match category
    UPDATE products SET total_colis = cat_count WHERE id = rec.id;
  END LOOP;
END;
$$;

-- Recalculate all stock
SELECT public.recalculate_all_stock();
