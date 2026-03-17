
-- Atomic function to decrement counts for a picking exit
-- Handles both complete set and individual colis modes
-- Uses "largest quantity first" strategy for location-split colis
CREATE OR REPLACE FUNCTION public.decrement_counts_for_picking(
  p_product_id uuid,
  p_total_colis integer,
  p_is_complete_set boolean,
  p_set_quantity integer DEFAULT 0,
  p_colis_quantities jsonb DEFAULT '{}'::jsonb,
  p_location_selections jsonb DEFAULT '[]'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  colis_num integer;
  qty_to_deduct integer;
  remaining integer;
  count_row RECORD;
  deduct_amount integer;
  selection RECORD;
BEGIN
  FOR colis_num IN 1..p_total_colis LOOP
    -- Determine quantity to deduct for this coli
    IF p_is_complete_set THEN
      qty_to_deduct := p_set_quantity;
    ELSE
      qty_to_deduct := COALESCE((p_colis_quantities->>colis_num::text)::integer, 0);
    END IF;

    -- Skip if nothing to deduct
    IF qty_to_deduct <= 0 THEN
      CONTINUE;
    END IF;

    -- Check if there are location-specific selections for this coli
    IF jsonb_array_length(p_location_selections) > 0 THEN
      -- Process location-specific selections
      FOR selection IN 
        SELECT * FROM jsonb_to_recordset(p_location_selections) 
        AS x("colisNumber" integer, "countId" uuid, "quantityToDeduct" integer)
        WHERE x."colisNumber" = colis_num AND x."quantityToDeduct" > 0
      LOOP
        UPDATE counts 
        SET quantity = GREATEST(0, quantity - selection."quantityToDeduct"),
            updated_at = now()
        WHERE id = selection."countId"
          AND product_id = p_product_id;
      END LOOP;
    ELSE
      -- Default: decrement from counts with largest quantity first
      remaining := qty_to_deduct;
      
      FOR count_row IN 
        SELECT id, quantity 
        FROM counts 
        WHERE product_id = p_product_id 
          AND colis_number = colis_num 
          AND quantity > 0
        ORDER BY quantity DESC
      LOOP
        EXIT WHEN remaining <= 0;
        
        deduct_amount := LEAST(count_row.quantity, remaining);
        
        UPDATE counts 
        SET quantity = count_row.quantity - deduct_amount,
            updated_at = now()
        WHERE id = count_row.id;
        
        remaining := remaining - deduct_amount;
      END LOOP;
    END IF;
  END LOOP;

  RETURN true;
END;
$$;
