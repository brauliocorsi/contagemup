
-- Fix: For products where stock_movements show entries but counts are zero,
-- update counts to reflect the net movement quantity.
-- This is a one-time correction for movements that were recorded but not reflected in counts.

DO $$
DECLARE
  rec RECORD;
  net_qty integer;
  coli integer;
  existing_count_id uuid;
BEGIN
  -- For each product with net positive movements but zero counts
  FOR rec IN
    SELECT sm.product_id, p.total_colis,
           SUM(CASE WHEN sm.movement_type = 'entrada' THEN sm.quantity ELSE 0 END) -
           SUM(CASE WHEN sm.movement_type = 'saida' THEN sm.quantity ELSE 0 END) as net_quantity
    FROM stock_movements sm
    JOIN products p ON p.id = sm.product_id
    GROUP BY sm.product_id, p.total_colis
    HAVING SUM(CASE WHEN sm.movement_type = 'entrada' THEN sm.quantity ELSE 0 END) -
           SUM(CASE WHEN sm.movement_type = 'saida' THEN sm.quantity ELSE 0 END) > 0
  LOOP
    net_qty := rec.net_quantity;
    
    -- Check if current counts already reflect this (skip if counts > 0)
    IF (SELECT COALESCE(MIN(
          (SELECT COALESCE(SUM(quantity), 0) FROM counts WHERE product_id = rec.product_id AND colis_number = g.n)
        ), 0)
        FROM generate_series(1, rec.total_colis) AS g(n)) > 0 THEN
      CONTINUE; -- Product already has stock in counts, skip
    END IF;
    
    -- Update each colis
    FOR coli IN 1..rec.total_colis LOOP
      -- Find existing count record for this colis
      SELECT id INTO existing_count_id
      FROM counts
      WHERE product_id = rec.product_id AND colis_number = coli
      LIMIT 1;
      
      IF existing_count_id IS NOT NULL THEN
        UPDATE counts SET quantity = net_qty, updated_at = now()
        WHERE id = existing_count_id;
      ELSE
        INSERT INTO counts (product_id, colis_number, quantity, session_id)
        VALUES (rec.product_id, coli, net_qty, NULL);
      END IF;
    END LOOP;
  END LOOP;
END;
$$;
