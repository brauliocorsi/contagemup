-- Function to sync counts with current_stock
-- This aligns historical counts with the actual stock by distributing
-- the current_stock value evenly across all colis for each product
CREATE OR REPLACE FUNCTION public.sync_counts_with_current_stock()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  product_row RECORD;
  target_qty integer;
  i integer;
  existing_count_id uuid;
BEGIN
  -- For each product, set each colis count to current_stock
  -- This ensures the counting view shows the same value as product management
  FOR product_row IN 
    SELECT id, total_colis, current_stock
    FROM products
  LOOP
    target_qty := product_row.current_stock;
    
    -- Update or insert count for each colis
    FOR i IN 1..product_row.total_colis LOOP
      -- Check if a count exists for this product/colis with session_id NULL (administrative)
      SELECT id INTO existing_count_id
      FROM counts
      WHERE product_id = product_row.id 
        AND colis_number = i
        AND session_id IS NULL
      LIMIT 1;
      
      IF existing_count_id IS NOT NULL THEN
        -- Update existing administrative count
        UPDATE counts
        SET quantity = target_qty, updated_at = now()
        WHERE id = existing_count_id;
      ELSE
        -- Insert new administrative count
        INSERT INTO counts (product_id, colis_number, quantity, session_id, location, pallet_number)
        VALUES (product_row.id, i, target_qty, NULL, NULL, NULL);
      END IF;
    END LOOP;
  END LOOP;
END;
$$;