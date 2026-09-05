-- 1. Quarantine locations
INSERT INTO public.warehouse_locations (code, location_type, position_in_aisle, notes)
VALUES ('QUARENTENA', 'quarantine', 0, 'Avarias à espera de decisão'),
       ('QUARENTENA-DEV', 'quarantine', 0, 'Devoluções de cliente à espera de triagem')
ON CONFLICT (code) DO UPDATE SET location_type = 'quarantine';

-- 2. Helper: is a location a quarantine location?
CREATE OR REPLACE FUNCTION public.is_quarantine_location(p_location text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.warehouse_locations wl
    WHERE wl.location_type = 'quarantine'
      AND lower(trim(wl.code)) = lower(trim(COALESCE(p_location, '')))
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_quarantine_location(text) TO authenticated, anon, service_role;

-- 3. Stock calculation excludes quarantine
CREATE OR REPLACE FUNCTION public.sync_product_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  affected_product_id uuid; base_stock integer; product_total_colis integer;
  category_colis_count integer; eff_colis integer; coli_qty integer; min_qty integer; i integer;
  ids uuid[]; pid uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN affected_product_id := OLD.product_id; ELSE affected_product_id := NEW.product_id; END IF;
  ids := ARRAY[affected_product_id];
  IF TG_OP = 'UPDATE' AND OLD.product_id IS DISTINCT FROM NEW.product_id THEN
    ids := ids || OLD.product_id;
  END IF;

  FOREACH pid IN ARRAY ids LOOP
    SELECT p.total_colis, COALESCE((SELECT count(*)::integer FROM jsonb_object_keys(c.colis_names) as k), 0)
      INTO product_total_colis, category_colis_count
      FROM products p LEFT JOIN categories c ON p.category = c.name WHERE p.id = pid;
    eff_colis := GREATEST(COALESCE(product_total_colis, 1), COALESCE(category_colis_count, 0));

    IF eff_colis <= 1 THEN
      SELECT COALESCE(SUM(quantity), 0) INTO base_stock FROM counts
       WHERE product_id = pid AND NOT public.is_quarantine_location(location);
    ELSE
      min_qty := NULL;
      FOR i IN 1..eff_colis LOOP
        SELECT COALESCE(SUM(quantity), 0) INTO coli_qty FROM counts
         WHERE product_id = pid AND colis_number = i AND NOT public.is_quarantine_location(location);
        IF min_qty IS NULL OR coli_qty < min_qty THEN min_qty := coli_qty; END IF;
      END LOOP;
      base_stock := COALESCE(min_qty, 0);
    END IF;

    UPDATE products SET current_stock = base_stock, updated_at = now() WHERE id = pid;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END; $function$;

CREATE OR REPLACE FUNCTION public.recalculate_all_stock()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  product_row RECORD; base_stock integer; category_colis_count integer;
  eff_colis integer; coli_qty integer; min_qty integer; i integer;
BEGIN
  FOR product_row IN SELECT p.id, p.total_colis, p.category FROM products p LOOP
    SELECT COALESCE((SELECT count(*)::integer FROM jsonb_object_keys(c.colis_names) as k), 0)
      INTO category_colis_count FROM categories c WHERE c.name = product_row.category;
    eff_colis := GREATEST(COALESCE(product_row.total_colis, 1), COALESCE(category_colis_count, 0));

    IF eff_colis <= 1 THEN
      SELECT COALESCE(SUM(quantity), 0) INTO base_stock FROM counts
       WHERE product_id = product_row.id AND NOT public.is_quarantine_location(location);
    ELSE
      min_qty := NULL;
      FOR i IN 1..eff_colis LOOP
        SELECT COALESCE(SUM(quantity), 0) INTO coli_qty FROM counts
         WHERE product_id = product_row.id AND colis_number = i AND NOT public.is_quarantine_location(location);
        IF min_qty IS NULL OR coli_qty < min_qty THEN min_qty := coli_qty; END IF;
      END LOOP;
      base_stock := COALESCE(min_qty, 0);
    END IF;

    UPDATE products SET current_stock = base_stock, updated_at = now() WHERE id = product_row.id;
  END LOOP;
END; $function$;

-- 4. register_damage: move to quarantine instead of deducting
CREATE OR REPLACE FUNCTION public.register_damage(p_product_id uuid, p_colis_number integer, p_quantity integer, p_damage_type text, p_description text, p_location text)
RETURNS product_damages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  v_src text := NULLIF(trim(COALESCE(p_location,'')), '');
  v_q text := 'QUARENTENA';
  v_colis integer[]; c integer; v_moved integer; v_total integer;
  first_source_id uuid; dmg public.product_damages; mv_id uuid;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN RAISE EXCEPTION 'quantity must be > 0'; END IF;

  IF p_colis_number IS NULL THEN
    v_total := public.effective_total_colis(p_product_id);
    SELECT array_agg(i) INTO v_colis FROM generate_series(1, GREATEST(v_total,1)) i;
  ELSE
    v_colis := ARRAY[p_colis_number];
  END IF;

  SELECT id INTO first_source_id FROM public.counts
   WHERE product_id = p_product_id AND colis_number = v_colis[1] AND quantity > 0
     AND (v_src IS NULL OR lower(trim(COALESCE(location,''))) = lower(v_src))
   ORDER BY quantity DESC LIMIT 1;

  INSERT INTO public.stock_movements (product_id, movement_type, quantity, reason, notes, created_by)
  VALUES (p_product_id, 'transferencia', p_quantity, 'avaria', p_description, uid)
  RETURNING id INTO mv_id;

  FOREACH c IN ARRAY v_colis LOOP
    v_moved := public.move_stock_qty(p_product_id, c, p_quantity, v_src, v_q);
    IF v_moved < p_quantity THEN
      RAISE EXCEPTION 'Stock insuficiente na localização de origem para o coli % (faltam %)', c, p_quantity - v_moved;
    END IF;
    INSERT INTO public.stock_movement_lines (movement_id, product_id, colis_number, quantity, location)
    VALUES (mv_id, p_product_id, c, v_moved, v_src);
  END LOOP;

  INSERT INTO public.product_damages (
    product_id, colis_number, quantity, damage_type, description, location, reported_by, status,
    source_count_id, source_colis_number, source_location
  ) VALUES (
    p_product_id, p_colis_number, p_quantity, p_damage_type, p_description, v_q, uid, 'active',
    first_source_id, p_colis_number, v_src
  ) RETURNING * INTO dmg;

  RETURN dmg;
END; $function$;

-- 5. resolve_damage with resolution branches
CREATE OR REPLACE FUNCTION public.resolve_damage(p_damage_id uuid, p_resolution_type text, p_resolution_notes text, p_destination_location text, p_supplier_reference text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  dmg public.product_damages; uid uuid := auth.uid();
  v_q text; v_colis integer[]; c integer; v_moved integer; v_total integer;
  v_dest text; mv_id uuid; rem integer; src RECORD; take integer;
  v_type text := lower(trim(COALESCE(p_resolution_type,'')));
  v_notes text := p_resolution_notes;
BEGIN
  SELECT * INTO dmg FROM public.product_damages WHERE id = p_damage_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Avaria % não encontrada', p_damage_id; END IF;
  IF dmg.status = 'resolved' THEN
    RETURN jsonb_build_object('status','already_resolved','damage_id',p_damage_id,'resolved_at',dmg.resolved_at);
  END IF;
  IF v_type NOT IN ('recuperado','abatido','devolvido_fornecedor','vendido_saldo') THEN
    RAISE EXCEPTION 'Tipo de resolução inválido: %', p_resolution_type;
  END IF;

  v_q := COALESCE(NULLIF(trim(COALESCE(dmg.location,'')),''), 'QUARENTENA');

  IF dmg.colis_number IS NULL THEN
    v_total := public.effective_total_colis(dmg.product_id);
    SELECT array_agg(i) INTO v_colis FROM generate_series(1, GREATEST(v_total,1)) i;
  ELSE
    v_colis := ARRAY[dmg.colis_number];
  END IF;

  IF v_type IN ('recuperado','vendido_saldo') THEN
    IF v_type = 'recuperado' THEN
      v_dest := NULLIF(trim(COALESCE(dmg.source_location,'')), '');
    ELSE
      v_dest := NULLIF(trim(COALESCE(p_destination_location,'')), '');
      IF v_dest IS NULL THEN RAISE EXCEPTION 'Localização de destino obrigatória para venda em saldo'; END IF;
      v_notes := COALESCE(v_notes || ' | ', '') || 'Segunda escolha';
    END IF;

    INSERT INTO public.stock_movements (product_id, movement_type, quantity, reason, notes, created_by)
    VALUES (dmg.product_id, 'transferencia', dmg.quantity,
            CASE WHEN v_type = 'recuperado' THEN 'avaria_recuperada' ELSE 'avaria_vendido_saldo' END,
            v_notes, uid)
    RETURNING id INTO mv_id;

    FOREACH c IN ARRAY v_colis LOOP
      v_moved := public.move_stock_qty(dmg.product_id, c, dmg.quantity, v_q, v_dest);
      INSERT INTO public.stock_movement_lines (movement_id, product_id, colis_number, quantity, location)
      VALUES (mv_id, dmg.product_id, c, v_moved, v_q);
    END LOOP;
  ELSE
    INSERT INTO public.stock_movements (product_id, movement_type, quantity, reason, reference, notes, created_by)
    VALUES (dmg.product_id, 'saida', dmg.quantity,
            CASE WHEN v_type = 'abatido' THEN 'abate' ELSE 'devolucao_fornecedor' END,
            NULLIF(trim(COALESCE(p_supplier_reference,'')), ''), v_notes, uid)
    RETURNING id INTO mv_id;

    FOREACH c IN ARRAY v_colis LOOP
      rem := dmg.quantity;
      FOR src IN
        SELECT id, quantity FROM public.counts
         WHERE product_id = dmg.product_id AND colis_number = c AND quantity > 0
           AND lower(trim(COALESCE(location,''))) = lower(v_q)
         ORDER BY quantity DESC FOR UPDATE
      LOOP
        EXIT WHEN rem <= 0;
        take := LEAST(src.quantity, rem);
        UPDATE public.counts SET quantity = quantity - take, updated_at = now() WHERE id = src.id;
        rem := rem - take;
      END LOOP;
      INSERT INTO public.stock_movement_lines (movement_id, product_id, colis_number, quantity, location)
      VALUES (mv_id, dmg.product_id, c, dmg.quantity - rem, v_q);
    END LOOP;
  END IF;

  UPDATE public.product_damages
     SET status = 'resolved', resolved_at = now(), resolution_type = v_type,
         resolution_notes = v_notes, updated_at = now()
   WHERE id = p_damage_id;

  RETURN jsonb_build_object('status','resolved','damage_id',p_damage_id,'resolution_type',v_type);
END; $function$;

CREATE OR REPLACE FUNCTION public.resolve_damage(p_damage_id uuid, p_resolution_type text, p_resolution_notes text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN public.resolve_damage(p_damage_id, p_resolution_type, p_resolution_notes, NULL::text, NULL::text);
END; $function$;

GRANT EXECUTE ON FUNCTION public.resolve_damage(uuid, text, text, text, text) TO authenticated, service_role;

-- 6. Client returns default to QUARENTENA-DEV
CREATE OR REPLACE FUNCTION public.return_note_items(p_note_id uuid, p_quarantine_location text DEFAULT 'QUARENTENA-DEV', p_items jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  it RECORD; v_qty integer; v_total integer; coli integer; v_moved integer; v_min integer;
  uid uuid := auth.uid(); v_q text; moved integer := 0;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  v_q := COALESCE(NULLIF(trim(COALESCE(p_quarantine_location,'')), ''), 'QUARENTENA-DEV');

  FOR it IN SELECT * FROM public.delivery_note_items WHERE note_id = p_note_id LOOP
    IF jsonb_array_length(COALESCE(p_items,'[]'::jsonb)) > 0 THEN
      SELECT COALESCE(x.quantity,0) INTO v_qty
      FROM jsonb_to_recordset(p_items) AS x(item_id uuid, quantity integer)
      WHERE x.item_id = it.id;
      v_qty := COALESCE(v_qty, 0);
    ELSE
      v_qty := GREATEST(COALESCE(NULLIF(it.loaded_quantity,0), it.staged_quantity) - it.returned_quantity, 0);
    END IF;
    IF v_qty <= 0 OR it.product_id IS NULL THEN CONTINUE; END IF;

    v_total := public.effective_total_colis(it.product_id);
    v_min := NULL;
    FOR coli IN 1..v_total LOOP
      v_moved := public.move_stock_qty(it.product_id, coli, v_qty, it.location, v_q);
      IF v_min IS NULL OR v_moved < v_min THEN v_min := v_moved; END IF;
    END LOOP;

    UPDATE public.delivery_note_items
    SET returned_quantity = returned_quantity + COALESCE(v_min,0), location = v_q, updated_at = now()
    WHERE id = it.id;
    moved := moved + COALESCE(v_min,0);
  END LOOP;

  UPDATE public.delivery_notes SET status = 'returned', returned_at = now() WHERE id = p_note_id;
  RETURN jsonb_build_object('moved', moved);
END; $function$;