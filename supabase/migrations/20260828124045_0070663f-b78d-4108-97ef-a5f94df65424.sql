CREATE OR REPLACE FUNCTION public.commit_exit_cart(p_items jsonb, p_reason text, p_reference text, p_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  item jsonb; v_product_id uuid; v_is_complete boolean; v_set_quantity integer;
  v_colis_quantities jsonb; v_location_selections jsonb;
  v_product_total_colis integer; v_category_colis_count integer; v_effective_total_colis integer;
  coli_num integer; qty_to_deduct integer; remaining integer; count_row RECORD;
  deduct_amount integer; selection RECORD; per_coli_debited jsonb; total_physical_debited integer;
  requested_business integer; fulfilled_business integer; unit_label text; status_label text;
  items_out jsonb := '[]'::jsonb; fully_fulfilled boolean := true; min_per_coli integer;
  uid uuid := auth.uid(); debited_this_coli integer; v_mov_id uuid; origins jsonb; o jsonb; src RECORD;
  used_ids uuid[];
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'p_items must be a JSON array';
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := (item->>'product_id')::uuid;
    v_is_complete := COALESCE((item->>'is_complete_set')::boolean, false);
    v_set_quantity := COALESCE((item->>'set_quantity')::integer, 0);
    v_colis_quantities := COALESCE(item->'colis_quantities', '{}'::jsonb);
    v_location_selections := COALESCE(item->'location_selections', '[]'::jsonb);

    SELECT p.total_colis, COALESCE((SELECT count(*)::integer FROM jsonb_object_keys(c.colis_names) k), 0)
      INTO v_product_total_colis, v_category_colis_count
    FROM public.products p LEFT JOIN public.categories c ON p.category = c.name
    WHERE p.id = v_product_id;

    v_effective_total_colis := GREATEST(COALESCE(v_product_total_colis,1), COALESCE(v_category_colis_count,0));
    IF v_effective_total_colis < 1 THEN v_effective_total_colis := 1; END IF;

    per_coli_debited := '{}'::jsonb;
    total_physical_debited := 0;
    origins := '[]'::jsonb;

    FOR coli_num IN 1..v_effective_total_colis LOOP
      IF v_is_complete THEN qty_to_deduct := v_set_quantity;
      ELSE qty_to_deduct := COALESCE((v_colis_quantities->>coli_num::text)::integer, 0); END IF;

      IF qty_to_deduct <= 0 THEN
        per_coli_debited := per_coli_debited || jsonb_build_object(coli_num::text, 0);
        CONTINUE;
      END IF;

      debited_this_coli := 0;
      used_ids := ARRAY[]::uuid[];

      -- 1) Honour explicit location selections for THIS coli (if any)
      IF jsonb_array_length(v_location_selections) > 0 THEN
        FOR selection IN
          SELECT * FROM jsonb_to_recordset(v_location_selections)
          AS x("colisNumber" integer, "countId" uuid, "quantityToDeduct" integer)
          WHERE x."colisNumber" = coli_num AND x."quantityToDeduct" > 0
        LOOP
          EXIT WHEN debited_this_coli >= qty_to_deduct;
          SELECT quantity, location INTO src FROM public.counts
            WHERE id = selection."countId" AND product_id = v_product_id;
          IF src IS NULL THEN CONTINUE; END IF;
          used_ids := used_ids || selection."countId";
          deduct_amount := LEAST(src.quantity, selection."quantityToDeduct", qty_to_deduct - debited_this_coli);
          IF deduct_amount > 0 THEN
            UPDATE public.counts SET quantity = quantity - deduct_amount, updated_at = now()
              WHERE id = selection."countId";
            debited_this_coli := debited_this_coli + deduct_amount;
            origins := origins || jsonb_build_array(jsonb_build_object(
              'coli', coli_num, 'qty', deduct_amount, 'location', src.location));
          END IF;
        END LOOP;
      END IF;

      -- 2) Auto-fill the remainder from other locations of the same coli
      IF debited_this_coli < qty_to_deduct THEN
        remaining := qty_to_deduct - debited_this_coli;
        FOR count_row IN
          SELECT id, quantity, location FROM public.counts
          WHERE product_id = v_product_id AND colis_number = coli_num AND quantity > 0
            AND NOT (id = ANY(used_ids))
          ORDER BY quantity DESC
        LOOP
          EXIT WHEN remaining <= 0;
          deduct_amount := LEAST(count_row.quantity, remaining);
          UPDATE public.counts SET quantity = count_row.quantity - deduct_amount, updated_at = now()
            WHERE id = count_row.id;
          remaining := remaining - deduct_amount;
          debited_this_coli := debited_this_coli + deduct_amount;
          origins := origins || jsonb_build_array(jsonb_build_object(
            'coli', coli_num, 'qty', deduct_amount, 'location', count_row.location));
        END LOOP;
      END IF;

      per_coli_debited := per_coli_debited || jsonb_build_object(coli_num::text, debited_this_coli);
      total_physical_debited := total_physical_debited + debited_this_coli;
    END LOOP;

    IF v_is_complete THEN
      unit_label := 'set';
      requested_business := v_set_quantity;
      min_per_coli := NULL;
      FOR coli_num IN 1..v_effective_total_colis LOOP
        deduct_amount := COALESCE((per_coli_debited->>coli_num::text)::integer, 0);
        IF min_per_coli IS NULL OR deduct_amount < min_per_coli THEN min_per_coli := deduct_amount; END IF;
      END LOOP;
      fulfilled_business := COALESCE(min_per_coli, 0);
    ELSE
      unit_label := 'unidade';
      requested_business := 0;
      FOR coli_num IN 1..v_effective_total_colis LOOP
        requested_business := requested_business + COALESCE((v_colis_quantities->>coli_num::text)::integer, 0);
      END LOOP;
      fulfilled_business := total_physical_debited;
    END IF;

    IF fulfilled_business >= requested_business AND requested_business > 0 THEN status_label := 'full';
    ELSIF fulfilled_business = 0 THEN status_label := 'none'; fully_fulfilled := false;
    ELSE status_label := 'partial'; fully_fulfilled := false; END IF;

    IF total_physical_debited > 0 THEN
      INSERT INTO public.stock_movements (product_id, movement_type, quantity, reason, reference, notes, created_by)
      VALUES (v_product_id, 'saida', total_physical_debited, p_reason, p_reference, p_notes, uid)
      RETURNING id INTO v_mov_id;

      FOR o IN SELECT * FROM jsonb_array_elements(origins) LOOP
        INSERT INTO public.stock_movement_lines (movement_id, product_id, colis_number, quantity, location)
        VALUES (v_mov_id, v_product_id, (o->>'coli')::int, (o->>'qty')::int, o->>'location');
      END LOOP;
    END IF;

    items_out := items_out || jsonb_build_array(jsonb_build_object(
      'product_id', v_product_id, 'unit', unit_label, 'requested', requested_business,
      'fulfilled', fulfilled_business, 'status', status_label));
  END LOOP;

  RETURN jsonb_build_object('items', items_out, 'fully_fulfilled', fully_fulfilled);
END; $function$;