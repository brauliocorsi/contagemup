-- 1. Consolidar contagens duplicadas (mesma localização, ignorando palete)
DROP INDEX IF EXISTS public.idx_counts_unique_product_colis_session_location_pallet;

DO $$
DECLARE g RECORD;
BEGIN
  FOR g IN
    SELECT product_id, colis_number,
           COALESCE(session_id,'00000000-0000-0000-0000-000000000000'::uuid) AS sid,
           COALESCE(location,'') AS loc,
           SUM(quantity)::int AS total,
           MIN(id::text)::uuid AS keep_id
    FROM public.counts
    GROUP BY 1,2,3,4
    HAVING COUNT(*) > 1
  LOOP
    DELETE FROM public.counts
      WHERE product_id = g.product_id
        AND colis_number = g.colis_number
        AND COALESCE(session_id,'00000000-0000-0000-0000-000000000000'::uuid) = g.sid
        AND COALESCE(location,'') = g.loc
        AND id <> g.keep_id;
    UPDATE public.counts SET quantity = g.total, updated_at = now() WHERE id = g.keep_id;
  END LOOP;
END $$;

-- 2. Remover colunas de palete
ALTER TABLE public.counts DROP COLUMN IF EXISTS pallet_number;
ALTER TABLE public.products DROP COLUMN IF EXISTS pallet_number;
ALTER TABLE public.stock_movement_lines DROP COLUMN IF EXISTS pallet_number;
ALTER TABLE public.product_damages DROP COLUMN IF EXISTS pallet_number;
ALTER TABLE public.product_damages DROP COLUMN IF EXISTS source_pallet_number;
ALTER TABLE public.location_audit_items DROP COLUMN IF EXISTS pallet_number;
ALTER TABLE public.picking_items DROP COLUMN IF EXISTS pallet_number;
ALTER TABLE public.reconciliation_items DROP COLUMN IF EXISTS pallet_number;
ALTER TABLE public.stock_order_numbers DROP COLUMN IF EXISTS pallet_number;

CREATE UNIQUE INDEX IF NOT EXISTS idx_counts_unique_product_colis_session_location
  ON public.counts (product_id, colis_number,
    COALESCE(session_id,'00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(location,''));

-- 3. Remover paletes do armazém
DROP TABLE IF EXISTS public.warehouse_pallets CASCADE;
DROP FUNCTION IF EXISTS public.transfer_pallet_location(text, text);

-- 4. Recriar funções sem palete
DROP FUNCTION IF EXISTS public.assign_count_location(uuid, text, text);
CREATE OR REPLACE FUNCTION public.assign_count_location(p_count_id uuid, p_location text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE src RECORD; target_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT * INTO src FROM public.counts WHERE id = p_count_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registo não encontrado'; END IF;

  SELECT id INTO target_id FROM public.counts
  WHERE product_id = src.product_id AND colis_number = src.colis_number AND id <> src.id
    AND COALESCE(location,'') = COALESCE(NULLIF(p_location,''),'')
  ORDER BY quantity DESC LIMIT 1;

  IF target_id IS NOT NULL THEN
    UPDATE public.counts SET quantity = quantity + src.quantity, updated_at = now() WHERE id = target_id;
    DELETE FROM public.counts WHERE id = src.id;
    RETURN target_id;
  END IF;

  UPDATE public.counts SET location = NULLIF(p_location,''), updated_at = now() WHERE id = src.id;
  RETURN src.id;
END; $function$;

CREATE OR REPLACE FUNCTION public.dedupe_counts_same_place()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE g RECORD; removed integer := 0;
BEGIN
  FOR g IN
    SELECT product_id, colis_number, COALESCE(location,'') AS loc,
           SUM(quantity)::int AS total, MIN(id::text)::uuid AS keep_id, COUNT(*) AS n
    FROM public.counts
    GROUP BY product_id, colis_number, COALESCE(location,'')
    HAVING COUNT(*) > 1
  LOOP
    DELETE FROM public.counts
    WHERE product_id = g.product_id AND colis_number = g.colis_number
      AND COALESCE(location,'') = g.loc AND id <> g.keep_id;
    removed := removed + (g.n - 1);
    UPDATE public.counts SET quantity = g.total, updated_at = now() WHERE id = g.keep_id;
  END LOOP;
  RETURN removed;
END; $function$;

DROP FUNCTION IF EXISTS public.merge_colis_counts(uuid, uuid, integer, text, text);
CREATE OR REPLACE FUNCTION public.merge_colis_counts(p_product_id uuid, p_session_id uuid, p_colis_number integer, p_location text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_total integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT COALESCE(SUM(quantity), 0) INTO v_total FROM public.counts
  WHERE product_id = p_product_id AND colis_number = p_colis_number
    AND (session_id = p_session_id OR session_id IS NULL);

  DELETE FROM public.counts
  WHERE product_id = p_product_id AND colis_number = p_colis_number
    AND (session_id = p_session_id OR session_id IS NULL);

  IF v_total > 0 THEN
    INSERT INTO public.counts (session_id, product_id, colis_number, quantity, location, counted_by)
    VALUES (p_session_id, p_product_id, p_colis_number, v_total, NULLIF(p_location, ''), auth.uid());
  END IF;
  RETURN v_total;
END; $function$;

CREATE OR REPLACE FUNCTION public.split_colis_counts(p_product_id uuid, p_session_id uuid, p_colis_number integer, p_distributions jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_inserted integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  DELETE FROM public.counts
  WHERE product_id = p_product_id AND colis_number = p_colis_number
    AND (session_id = p_session_id OR session_id IS NULL);

  INSERT INTO public.counts (session_id, product_id, colis_number, quantity, location, counted_by)
  SELECT p_session_id, p_product_id, p_colis_number, SUM((d->>'quantity')::int), NULLIF(d->>'location',''), auth.uid()
  FROM jsonb_array_elements(p_distributions) d
  WHERE COALESCE((d->>'quantity')::int, 0) > 0
  GROUP BY NULLIF(d->>'location','');

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END; $function$;

DROP FUNCTION IF EXISTS public.register_entry(uuid, jsonb, text, text, text, text, text);
CREATE OR REPLACE FUNCTION public.register_entry(p_product_id uuid, p_colis_quantities jsonb, p_location text, p_reason text, p_reference text, p_notes text)
RETURNS stock_movements LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  k text; qty integer; coli_num integer; total_qty integer := 0;
  existing_id uuid; mov public.stock_movements; uid uuid := auth.uid();
  lines jsonb := '[]'::jsonb; ln jsonb;
BEGIN
  IF p_colis_quantities IS NULL OR jsonb_typeof(p_colis_quantities) <> 'object' THEN
    RAISE EXCEPTION 'p_colis_quantities must be a JSON object';
  END IF;

  FOR k, qty IN SELECT key, COALESCE((value)::text::integer, 0) FROM jsonb_each_text(p_colis_quantities) LOOP
    coli_num := k::integer;
    IF qty IS NULL OR qty <= 0 THEN CONTINUE; END IF;

    SELECT id INTO existing_id FROM public.counts
    WHERE product_id = p_product_id AND colis_number = coli_num
      AND COALESCE(location,'') = COALESCE(p_location,'')
    ORDER BY (session_id IS NULL) DESC, quantity DESC LIMIT 1;

    IF existing_id IS NOT NULL THEN
      UPDATE public.counts SET quantity = quantity + qty, updated_at = now() WHERE id = existing_id;
    ELSE
      INSERT INTO public.counts (product_id, colis_number, quantity, session_id, location, counted_by)
      VALUES (p_product_id, coli_num, qty, NULL, p_location, uid);
    END IF;

    total_qty := total_qty + qty;
    lines := lines || jsonb_build_array(jsonb_build_object('coli', coli_num, 'qty', qty));
  END LOOP;

  IF total_qty <= 0 THEN RAISE EXCEPTION 'No positive quantities provided'; END IF;

  INSERT INTO public.stock_movements (product_id, movement_type, quantity, reason, reference, notes, created_by)
  VALUES (p_product_id, 'entrada', total_qty, p_reason, p_reference, p_notes, uid)
  RETURNING * INTO mov;

  FOR ln IN SELECT * FROM jsonb_array_elements(lines) LOOP
    INSERT INTO public.stock_movement_lines (movement_id, product_id, colis_number, quantity, location)
    VALUES (mov.id, p_product_id, (ln->>'coli')::int, (ln->>'qty')::int, p_location);
  END LOOP;

  RETURN mov;
END; $function$;

CREATE OR REPLACE FUNCTION public.commit_exit_cart(p_items jsonb, p_reason text, p_reference text, p_notes text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  item jsonb; v_product_id uuid; v_is_complete boolean; v_set_quantity integer;
  v_colis_quantities jsonb; v_location_selections jsonb;
  v_product_total_colis integer; v_category_colis_count integer; v_effective_total_colis integer;
  coli_num integer; qty_to_deduct integer; remaining integer; count_row RECORD;
  deduct_amount integer; selection RECORD; per_coli_debited jsonb; total_physical_debited integer;
  requested_business integer; fulfilled_business integer; unit_label text; status_label text;
  items_out jsonb := '[]'::jsonb; fully_fulfilled boolean := true; min_per_coli integer;
  uid uuid := auth.uid(); debited_this_coli integer; v_mov_id uuid; origins jsonb; o jsonb; src RECORD;
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

      IF jsonb_array_length(v_location_selections) > 0 THEN
        FOR selection IN
          SELECT * FROM jsonb_to_recordset(v_location_selections)
          AS x("colisNumber" integer, "countId" uuid, "quantityToDeduct" integer)
          WHERE x."colisNumber" = coli_num AND x."quantityToDeduct" > 0
        LOOP
          SELECT quantity, location INTO src FROM public.counts
            WHERE id = selection."countId" AND product_id = v_product_id;
          IF src IS NULL THEN CONTINUE; END IF;
          deduct_amount := LEAST(src.quantity, selection."quantityToDeduct");
          IF deduct_amount > 0 THEN
            UPDATE public.counts SET quantity = quantity - deduct_amount, updated_at = now()
              WHERE id = selection."countId";
            debited_this_coli := debited_this_coli + deduct_amount;
            origins := origins || jsonb_build_array(jsonb_build_object(
              'coli', coli_num, 'qty', deduct_amount, 'location', src.location));
          END IF;
        END LOOP;
      ELSE
        remaining := qty_to_deduct;
        FOR count_row IN
          SELECT id, quantity, location FROM public.counts
          WHERE product_id = v_product_id AND colis_number = coli_num AND quantity > 0
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

    IF fulfilled_business = requested_business AND requested_business > 0 THEN status_label := 'full';
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

DROP FUNCTION IF EXISTS public.register_damage(uuid, integer, integer, text, text, text, text);
CREATE OR REPLACE FUNCTION public.register_damage(p_product_id uuid, p_colis_number integer, p_quantity integer, p_damage_type text, p_description text, p_location text)
RETURNS product_damages LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  target_count RECORD; remaining integer := p_quantity; deduct_amount integer;
  first_source_id uuid; dmg public.product_damages; uid uuid := auth.uid();
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN RAISE EXCEPTION 'quantity must be > 0'; END IF;

  FOR target_count IN
    SELECT id, quantity, location FROM public.counts
    WHERE product_id = p_product_id AND colis_number = p_colis_number AND quantity > 0
      AND (p_location IS NULL OR COALESCE(location,'') = COALESCE(p_location,''))
    ORDER BY quantity DESC
  LOOP
    EXIT WHEN remaining <= 0;
    deduct_amount := LEAST(target_count.quantity, remaining);
    UPDATE public.counts SET quantity = quantity - deduct_amount, updated_at = now() WHERE id = target_count.id;
    IF first_source_id IS NULL THEN first_source_id := target_count.id; END IF;
    remaining := remaining - deduct_amount;
  END LOOP;

  IF remaining > 0 THEN RAISE EXCEPTION 'Insufficient stock to register damage (% short)', remaining; END IF;

  INSERT INTO public.product_damages (
    product_id, colis_number, quantity, damage_type, description, location, reported_by, status,
    source_count_id, source_colis_number, source_location
  ) VALUES (
    p_product_id, p_colis_number, p_quantity, p_damage_type, p_description, p_location, uid, 'active',
    first_source_id, p_colis_number, p_location
  ) RETURNING * INTO dmg;

  INSERT INTO public.stock_movements (product_id, movement_type, quantity, reason, notes, created_by)
  VALUES (p_product_id, 'saida', p_quantity, 'avaria', p_description, uid);

  RETURN dmg;
END; $function$;

CREATE OR REPLACE FUNCTION public.resolve_damage(p_damage_id uuid, p_resolution_type text, p_resolution_notes text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE dmg public.product_damages; existing_id uuid; uid uuid := auth.uid();
BEGIN
  SELECT * INTO dmg FROM public.product_damages WHERE id = p_damage_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Damage % not found', p_damage_id; END IF;

  IF dmg.status = 'resolved' THEN
    RETURN jsonb_build_object('status','already_resolved','damage_id',p_damage_id,'resolved_at',dmg.resolved_at);
  END IF;

  SELECT id INTO existing_id FROM public.counts
  WHERE product_id = dmg.product_id
    AND colis_number = COALESCE(dmg.source_colis_number, dmg.colis_number)
    AND session_id IS NULL
    AND COALESCE(location,'') = COALESCE(dmg.source_location, dmg.location, '')
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    UPDATE public.counts SET quantity = quantity + dmg.quantity, updated_at = now() WHERE id = existing_id;
  ELSE
    INSERT INTO public.counts (product_id, colis_number, quantity, session_id, location, counted_by)
    VALUES (dmg.product_id, COALESCE(dmg.source_colis_number, dmg.colis_number), dmg.quantity, NULL,
            COALESCE(dmg.source_location, dmg.location), uid);
  END IF;

  UPDATE public.product_damages
    SET status = 'resolved', resolved_at = now(), resolution_type = p_resolution_type,
        resolution_notes = p_resolution_notes, updated_at = now()
    WHERE id = p_damage_id;

  INSERT INTO public.stock_movements (product_id, movement_type, quantity, reason, notes, created_by)
  VALUES (dmg.product_id, 'entrada', dmg.quantity, 'avaria_resolvida', p_resolution_notes, uid);

  RETURN jsonb_build_object('status','resolved','damage_id',p_damage_id);
END; $function$;

CREATE OR REPLACE FUNCTION public.reverse_stock_movement(p_movement_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  mov public.stock_movements; ln RECORD; existing_id uuid; delta integer;
  new_mov_id uuid; uid uuid := auth.uid(); n_lines integer := 0;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  SELECT * INTO mov FROM public.stock_movements WHERE id = p_movement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Movimento não encontrado'; END IF;
  IF mov.reversed_at IS NOT NULL THEN RAISE EXCEPTION 'Movimento já foi anulado'; END IF;
  IF mov.reverses_movement_id IS NOT NULL THEN RAISE EXCEPTION 'Não é possível anular um movimento de reversão'; END IF;

  SELECT count(*) INTO n_lines FROM public.stock_movement_lines WHERE movement_id = p_movement_id;
  IF n_lines = 0 THEN
    RAISE EXCEPTION 'Este movimento é anterior ao rastreio por localização e não pode ser anulado automaticamente';
  END IF;

  FOR ln IN SELECT * FROM public.stock_movement_lines WHERE movement_id = p_movement_id LOOP
    IF mov.movement_type = 'entrada' THEN delta := -ln.quantity; ELSE delta := ln.quantity; END IF;

    SELECT id INTO existing_id FROM public.counts
    WHERE product_id = ln.product_id AND colis_number = ln.colis_number
      AND COALESCE(location,'') = COALESCE(ln.location,'')
    ORDER BY (session_id IS NULL) DESC, quantity DESC LIMIT 1;

    IF existing_id IS NOT NULL THEN
      UPDATE public.counts SET quantity = quantity + delta, updated_at = now() WHERE id = existing_id;
    ELSE
      INSERT INTO public.counts (product_id, colis_number, quantity, session_id, location, counted_by)
      VALUES (ln.product_id, ln.colis_number, delta, NULL, ln.location, uid);
    END IF;
  END LOOP;

  INSERT INTO public.stock_movements (product_id, movement_type, quantity, reason, reference, notes, created_by, reverses_movement_id)
  VALUES (mov.product_id,
    CASE WHEN mov.movement_type = 'entrada' THEN 'saida' ELSE 'entrada' END,
    mov.quantity, 'anulação', mov.reference, 'Anulação do movimento ' || mov.id::text, uid, mov.id)
  RETURNING id INTO new_mov_id;

  INSERT INTO public.stock_movement_lines (movement_id, product_id, colis_number, quantity, location)
  SELECT new_mov_id, product_id, colis_number, quantity, location
  FROM public.stock_movement_lines WHERE movement_id = p_movement_id;

  UPDATE public.stock_movements SET reversed_at = now(), reversed_by = uid WHERE id = p_movement_id;

  RETURN jsonb_build_object('status','reversed','movement_id',p_movement_id,'reversal_id',new_mov_id);
END; $function$;

CREATE OR REPLACE FUNCTION public.transfer_stock_location(p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  it jsonb; src RECORD; v_qty integer; v_location text; target_id uuid;
  moved integer := 0; uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'p_items must be a JSON array';
  END IF;

  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO src FROM public.counts WHERE id = (it->>'count_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;

    v_qty := LEAST(COALESCE((it->>'quantity')::integer, 0), src.quantity);
    IF v_qty <= 0 THEN CONTINUE; END IF;

    v_location := NULLIF(trim(COALESCE(it->>'location', '')), '');
    IF COALESCE(src.location,'') = COALESCE(v_location,'') THEN CONTINUE; END IF;

    SELECT id INTO target_id FROM public.counts
    WHERE product_id = src.product_id AND colis_number = src.colis_number AND id <> src.id
      AND COALESCE(location,'') = COALESCE(v_location,'')
    ORDER BY (session_id IS NULL) DESC, quantity DESC LIMIT 1;

    IF v_qty = src.quantity AND target_id IS NULL THEN
      UPDATE public.counts SET location = v_location, updated_at = now() WHERE id = src.id;
    ELSE
      IF v_qty = src.quantity THEN
        DELETE FROM public.counts WHERE id = src.id;
      ELSE
        UPDATE public.counts SET quantity = quantity - v_qty, updated_at = now() WHERE id = src.id;
      END IF;

      IF target_id IS NOT NULL THEN
        UPDATE public.counts SET quantity = quantity + v_qty, updated_at = now() WHERE id = target_id;
      ELSE
        INSERT INTO public.counts (product_id, colis_number, quantity, session_id, location, counted_by)
        VALUES (src.product_id, src.colis_number, v_qty, NULL, v_location, uid);
      END IF;
    END IF;

    moved := moved + 1;
  END LOOP;

  RETURN jsonb_build_object('moved', moved);
END; $function$;