-- 1. permitir tipo 'zona' e criar SEM-LOCALIZACAO
ALTER TABLE public.warehouse_locations DROP CONSTRAINT IF EXISTS warehouse_locations_location_type_check;
ALTER TABLE public.warehouse_locations ADD CONSTRAINT warehouse_locations_location_type_check
  CHECK (location_type = ANY (ARRAY['stock','pre_exit','transport','quarantine','conferencia','zona']));

INSERT INTO public.warehouse_locations (code, position_in_aisle, is_staging, location_type, notes)
SELECT 'SEM-LOCALIZACAO', 0, true, 'zona', 'Stock por arrumar — localização física desconhecida'
WHERE NOT EXISTS (SELECT 1 FROM public.warehouse_locations WHERE code = 'SEM-LOCALIZACAO');

-- 2. validador central
CREATE OR REPLACE FUNCTION public.assert_valid_location(p_location text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v text; v_code text;
BEGIN
  v := NULLIF(btrim(COALESCE(p_location, '')), '');
  IF v IS NULL THEN
    RAISE EXCEPTION 'Localização obrigatória: escolha uma localização (use SEM-LOCALIZACAO se ainda não souber onde fica).';
  END IF;
  SELECT code INTO v_code FROM public.warehouse_locations
  WHERE upper(btrim(code)) = upper(v) LIMIT 1;
  IF v_code IS NULL THEN
    RAISE EXCEPTION 'A localização "%" não existe no cadastro do armazém.', v;
  END IF;
  RETURN v_code;
END; $function$;

GRANT EXECUTE ON FUNCTION public.assert_valid_location(text) TO authenticated, service_role;

-- 3. register_entry: exigir localização válida
CREATE OR REPLACE FUNCTION public.register_entry(p_product_id uuid, p_colis_quantities jsonb, p_location text, p_reason text, p_reference text, p_notes text)
RETURNS stock_movements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  k text; qty integer; coli_num integer; total_qty integer := 0;
  existing_id uuid; mov public.stock_movements; uid uuid := auth.uid();
  lines jsonb := '[]'::jsonb; ln jsonb;
  v_loc text;
BEGIN
  IF p_colis_quantities IS NULL OR jsonb_typeof(p_colis_quantities) <> 'object' THEN
    RAISE EXCEPTION 'p_colis_quantities must be a JSON object';
  END IF;

  v_loc := public.assert_valid_location(p_location);

  FOR k, qty IN SELECT key, COALESCE((value)::text::integer, 0) FROM jsonb_each_text(p_colis_quantities) LOOP
    coli_num := k::integer;
    IF qty IS NULL OR qty <= 0 THEN CONTINUE; END IF;

    SELECT id INTO existing_id FROM public.counts
    WHERE product_id = p_product_id AND colis_number = coli_num
      AND COALESCE(location,'') = v_loc
    ORDER BY (session_id IS NULL) DESC, quantity DESC LIMIT 1;

    IF existing_id IS NOT NULL THEN
      UPDATE public.counts SET quantity = quantity + qty, updated_at = now() WHERE id = existing_id;
    ELSE
      INSERT INTO public.counts (product_id, colis_number, quantity, session_id, location, counted_by)
      VALUES (p_product_id, coli_num, qty, NULL, v_loc, uid);
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
    VALUES (mov.id, p_product_id, (ln->>'coli')::int, (ln->>'qty')::int, v_loc);
  END LOOP;

  RETURN mov;
END; $function$;

-- 4. assign_count_location: validar destino
CREATE OR REPLACE FUNCTION public.assign_count_location(p_count_id uuid, p_location text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE src RECORD; target_id uuid; v_loc text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  v_loc := public.assert_valid_location(p_location);
  SELECT * INTO src FROM public.counts WHERE id = p_count_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registo não encontrado'; END IF;

  SELECT id INTO target_id FROM public.counts
  WHERE product_id = src.product_id AND colis_number = src.colis_number AND id <> src.id
    AND COALESCE(location,'') = v_loc
  ORDER BY quantity DESC LIMIT 1;

  IF target_id IS NOT NULL THEN
    UPDATE public.counts SET quantity = quantity + src.quantity, updated_at = now() WHERE id = target_id;
    DELETE FROM public.counts WHERE id = src.id;
    RETURN target_id;
  END IF;

  UPDATE public.counts SET location = v_loc, updated_at = now() WHERE id = src.id;
  RETURN src.id;
END; $function$;

-- 5. merge_colis_counts
CREATE OR REPLACE FUNCTION public.merge_colis_counts(p_product_id uuid, p_session_id uuid, p_colis_number integer, p_location text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_total integer; v_loc text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  v_loc := public.assert_valid_location(p_location);
  SELECT COALESCE(SUM(quantity), 0) INTO v_total FROM public.counts
  WHERE product_id = p_product_id AND colis_number = p_colis_number
    AND (session_id = p_session_id OR session_id IS NULL);

  DELETE FROM public.counts
  WHERE product_id = p_product_id AND colis_number = p_colis_number
    AND (session_id = p_session_id OR session_id IS NULL);

  IF v_total > 0 THEN
    INSERT INTO public.counts (session_id, product_id, colis_number, quantity, location, counted_by)
    VALUES (p_session_id, p_product_id, p_colis_number, v_total, v_loc, auth.uid());
  END IF;
  RETURN v_total;
END; $function$;

-- 6. split_colis_counts
CREATE OR REPLACE FUNCTION public.split_colis_counts(p_product_id uuid, p_session_id uuid, p_colis_number integer, p_distributions jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_inserted integer := 0; d jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  FOR d IN SELECT * FROM jsonb_array_elements(p_distributions) LOOP
    IF COALESCE((d->>'quantity')::int, 0) > 0 THEN
      PERFORM public.assert_valid_location(d->>'location');
    END IF;
  END LOOP;

  DELETE FROM public.counts
  WHERE product_id = p_product_id AND colis_number = p_colis_number
    AND (session_id = p_session_id OR session_id IS NULL);

  INSERT INTO public.counts (session_id, product_id, colis_number, quantity, location, counted_by)
  SELECT p_session_id, p_product_id, p_colis_number, SUM((d2->>'quantity')::int),
         public.assert_valid_location(d2->>'location'), auth.uid()
  FROM jsonb_array_elements(p_distributions) d2
  WHERE COALESCE((d2->>'quantity')::int, 0) > 0
  GROUP BY public.assert_valid_location(d2->>'location');

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END; $function$;

-- 7. transfer_stock_location
CREATE OR REPLACE FUNCTION public.transfer_stock_location(p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

    v_location := public.assert_valid_location(it->>'location');
    IF COALESCE(src.location,'') = v_location THEN CONTINUE; END IF;

    SELECT id INTO target_id FROM public.counts
    WHERE product_id = src.product_id AND colis_number = src.colis_number AND id <> src.id
      AND COALESCE(location,'') = v_location
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

-- 8. arrumação em lote com rasto
CREATE OR REPLACE FUNCTION public.putaway_counts(p_count_ids uuid[], p_location text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_loc text; cid uuid; src RECORD; mov_id uuid; uid uuid := auth.uid();
  v_done integer := 0; v_units integer := 0; v_from text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  v_loc := public.assert_valid_location(p_location);

  FOREACH cid IN ARRAY COALESCE(p_count_ids, ARRAY[]::uuid[]) LOOP
    SELECT * INTO src FROM public.counts WHERE id = cid FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;
    IF src.quantity <= 0 THEN CONTINUE; END IF;
    v_from := COALESCE(NULLIF(btrim(COALESCE(src.location,'')),''), 'SEM LOCALIZAÇÃO');
    IF COALESCE(src.location,'') = v_loc THEN CONTINUE; END IF;

    INSERT INTO public.stock_movements (product_id, movement_type, quantity, reason, reference, notes, created_by)
    VALUES (src.product_id, 'transferencia', src.quantity, 'arrumacao', v_loc,
            'Arrumação: ' || v_from || ' → ' || v_loc, uid)
    RETURNING id INTO mov_id;

    INSERT INTO public.stock_movement_lines (movement_id, product_id, colis_number, quantity, location, location_to)
    VALUES (mov_id, src.product_id, src.colis_number, src.quantity, src.location, v_loc);

    PERFORM public.assign_count_location(cid, v_loc);

    v_done := v_done + 1;
    v_units := v_units + src.quantity;
  END LOOP;

  RETURN jsonb_build_object('lines', v_done, 'units', v_units, 'location', v_loc);
END; $function$;

GRANT EXECUTE ON FUNCTION public.putaway_counts(uuid[], text) TO authenticated, service_role;