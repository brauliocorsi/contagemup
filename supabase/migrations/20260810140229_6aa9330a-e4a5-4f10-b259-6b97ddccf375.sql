CREATE OR REPLACE FUNCTION public.register_entry(p_product_id uuid, p_colis_quantities jsonb, p_location text, p_pallet_number text, p_reason text, p_reference text, p_notes text)
 RETURNS stock_movements
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  k text;
  qty integer;
  coli_num integer;
  total_qty integer := 0;
  existing_id uuid;
  mov public.stock_movements;
  uid uuid := auth.uid();
BEGIN
  IF p_colis_quantities IS NULL OR jsonb_typeof(p_colis_quantities) <> 'object' THEN
    RAISE EXCEPTION 'p_colis_quantities must be a JSON object';
  END IF;

  FOR k, qty IN
    SELECT key, COALESCE((value)::text::integer, 0)
    FROM jsonb_each_text(p_colis_quantities)
  LOOP
    coli_num := k::integer;
    IF qty IS NULL OR qty <= 0 THEN
      CONTINUE;
    END IF;

    -- Match any existing row for the same product/coli/location/pallet,
    -- regardless of session (avoids duplicate rows in the same place)
    SELECT id INTO existing_id
    FROM public.counts
    WHERE product_id = p_product_id
      AND colis_number = coli_num
      AND COALESCE(location,'') = COALESCE(p_location,'')
      AND COALESCE(pallet_number,'') = COALESCE(p_pallet_number,'')
    ORDER BY (session_id IS NULL) DESC, quantity DESC
    LIMIT 1;

    IF existing_id IS NOT NULL THEN
      UPDATE public.counts
        SET quantity = quantity + qty, updated_at = now()
        WHERE id = existing_id;
    ELSE
      INSERT INTO public.counts (product_id, colis_number, quantity, session_id, location, pallet_number, counted_by)
      VALUES (p_product_id, coli_num, qty, NULL, p_location, p_pallet_number, uid);
    END IF;

    total_qty := total_qty + qty;
  END LOOP;

  IF total_qty <= 0 THEN
    RAISE EXCEPTION 'No positive quantities provided';
  END IF;

  INSERT INTO public.stock_movements (product_id, movement_type, quantity, reason, reference, notes, created_by)
  VALUES (p_product_id, 'entrada', total_qty, p_reason, p_reference, p_notes, uid)
  RETURNING * INTO mov;

  RETURN mov;
END;
$function$;

-- Consolidate existing duplicate count rows (same product, coli, location, pallet)
CREATE OR REPLACE FUNCTION public.dedupe_counts_same_place()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  g RECORD;
  removed integer := 0;
BEGIN
  FOR g IN
    SELECT product_id, colis_number, COALESCE(location,'') AS loc, COALESCE(pallet_number,'') AS pal,
           SUM(quantity)::int AS total, MIN(id::text)::uuid AS keep_id, COUNT(*) AS n
    FROM public.counts
    GROUP BY product_id, colis_number, COALESCE(location,''), COALESCE(pallet_number,'')
    HAVING COUNT(*) > 1
  LOOP
    DELETE FROM public.counts
    WHERE product_id = g.product_id
      AND colis_number = g.colis_number
      AND COALESCE(location,'') = g.loc
      AND COALESCE(pallet_number,'') = g.pal
      AND id <> g.keep_id;

    removed := removed + (g.n - 1);

    UPDATE public.counts SET quantity = g.total, updated_at = now() WHERE id = g.keep_id;
  END LOOP;

  RETURN removed;
END;
$function$;