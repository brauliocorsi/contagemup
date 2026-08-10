-- 1. Linhas detalhadas dos movimentos
CREATE TABLE public.stock_movement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_id uuid NOT NULL REFERENCES public.stock_movements(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  colis_number integer NOT NULL,
  quantity integer NOT NULL,
  location text,
  pallet_number text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_movement_lines TO authenticated;
GRANT ALL ON public.stock_movement_lines TO service_role;

ALTER TABLE public.stock_movement_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view movement lines"
  ON public.stock_movement_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert movement lines"
  ON public.stock_movement_lines FOR INSERT TO authenticated WITH CHECK (true);

CREATE INDEX idx_smlines_movement ON public.stock_movement_lines(movement_id);
CREATE INDEX idx_smlines_product ON public.stock_movement_lines(product_id);

-- 2. Campos de anulação
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_by uuid,
  ADD COLUMN IF NOT EXISTS reverses_movement_id uuid REFERENCES public.stock_movements(id);

-- 3. register_entry passa a gravar linhas
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
  lines jsonb := '[]'::jsonb;
  ln jsonb;
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
    lines := lines || jsonb_build_array(jsonb_build_object('coli', coli_num, 'qty', qty));
  END LOOP;

  IF total_qty <= 0 THEN
    RAISE EXCEPTION 'No positive quantities provided';
  END IF;

  INSERT INTO public.stock_movements (product_id, movement_type, quantity, reason, reference, notes, created_by)
  VALUES (p_product_id, 'entrada', total_qty, p_reason, p_reference, p_notes, uid)
  RETURNING * INTO mov;

  FOR ln IN SELECT * FROM jsonb_array_elements(lines) LOOP
    INSERT INTO public.stock_movement_lines (movement_id, product_id, colis_number, quantity, location, pallet_number)
    VALUES (mov.id, p_product_id, (ln->>'coli')::int, (ln->>'qty')::int, p_location, p_pallet_number);
  END LOOP;

  RETURN mov;
END;
$function$;

-- 4. commit_exit_cart passa a gravar linhas por origem
CREATE OR REPLACE FUNCTION public.commit_exit_cart(p_items jsonb, p_reason text, p_reference text, p_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  item jsonb;
  v_product_id uuid;
  v_is_complete boolean;
  v_set_quantity integer;
  v_colis_quantities jsonb;
  v_location_selections jsonb;
  v_product_total_colis integer;
  v_category_colis_count integer;
  v_effective_total_colis integer;
  coli_num integer;
  qty_to_deduct integer;
  remaining integer;
  count_row RECORD;
  deduct_amount integer;
  selection RECORD;
  per_coli_debited jsonb;
  total_physical_debited integer;
  requested_business integer;
  fulfilled_business integer;
  unit_label text;
  status_label text;
  items_out jsonb := '[]'::jsonb;
  fully_fulfilled boolean := true;
  min_per_coli integer;
  uid uuid := auth.uid();
  debited_this_coli integer;
  v_mov_id uuid;
  origins jsonb;
  o jsonb;
  src RECORD;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'p_items must be a JSON array';
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (item->>'product_id')::uuid;
    v_is_complete := COALESCE((item->>'is_complete_set')::boolean, false);
    v_set_quantity := COALESCE((item->>'set_quantity')::integer, 0);
    v_colis_quantities := COALESCE(item->'colis_quantities', '{}'::jsonb);
    v_location_selections := COALESCE(item->'location_selections', '[]'::jsonb);

    SELECT p.total_colis,
           COALESCE((SELECT count(*)::integer FROM jsonb_object_keys(c.colis_names) k), 0)
      INTO v_product_total_colis, v_category_colis_count
    FROM public.products p
    LEFT JOIN public.categories c ON p.category = c.name
    WHERE p.id = v_product_id;

    v_effective_total_colis := GREATEST(COALESCE(v_product_total_colis,1), COALESCE(v_category_colis_count,0));
    IF v_effective_total_colis < 1 THEN v_effective_total_colis := 1; END IF;

    per_coli_debited := '{}'::jsonb;
    total_physical_debited := 0;
    origins := '[]'::jsonb;

    FOR coli_num IN 1..v_effective_total_colis LOOP
      IF v_is_complete THEN
        qty_to_deduct := v_set_quantity;
      ELSE
        qty_to_deduct := COALESCE((v_colis_quantities->>coli_num::text)::integer, 0);
      END IF;

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
          SELECT quantity, location, pallet_number INTO src
            FROM public.counts
            WHERE id = selection."countId" AND product_id = v_product_id;
          IF src IS NULL THEN CONTINUE; END IF;
          deduct_amount := LEAST(src.quantity, selection."quantityToDeduct");
          IF deduct_amount > 0 THEN
            UPDATE public.counts
              SET quantity = quantity - deduct_amount, updated_at = now()
              WHERE id = selection."countId";
            debited_this_coli := debited_this_coli + deduct_amount;
            origins := origins || jsonb_build_array(jsonb_build_object(
              'coli', coli_num, 'qty', deduct_amount,
              'location', src.location, 'pallet', src.pallet_number));
          END IF;
        END LOOP;
      ELSE
        remaining := qty_to_deduct;
        FOR count_row IN
          SELECT id, quantity, location, pallet_number FROM public.counts
          WHERE product_id = v_product_id AND colis_number = coli_num AND quantity > 0
          ORDER BY quantity DESC
        LOOP
          EXIT WHEN remaining <= 0;
          deduct_amount := LEAST(count_row.quantity, remaining);
          UPDATE public.counts
            SET quantity = count_row.quantity - deduct_amount, updated_at = now()
            WHERE id = count_row.id;
          remaining := remaining - deduct_amount;
          debited_this_coli := debited_this_coli + deduct_amount;
          origins := origins || jsonb_build_array(jsonb_build_object(
            'coli', coli_num, 'qty', deduct_amount,
            'location', count_row.location, 'pallet', count_row.pallet_number));
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
        IF min_per_coli IS NULL OR deduct_amount < min_per_coli THEN
          min_per_coli := deduct_amount;
        END IF;
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

    IF fulfilled_business = requested_business AND requested_business > 0 THEN
      status_label := 'full';
    ELSIF fulfilled_business = 0 THEN
      status_label := 'none';
      fully_fulfilled := false;
    ELSE
      status_label := 'partial';
      fully_fulfilled := false;
    END IF;

    IF total_physical_debited > 0 THEN
      INSERT INTO public.stock_movements (product_id, movement_type, quantity, reason, reference, notes, created_by)
      VALUES (v_product_id, 'saida', total_physical_debited, p_reason, p_reference, p_notes, uid)
      RETURNING id INTO v_mov_id;

      FOR o IN SELECT * FROM jsonb_array_elements(origins) LOOP
        INSERT INTO public.stock_movement_lines (movement_id, product_id, colis_number, quantity, location, pallet_number)
        VALUES (v_mov_id, v_product_id, (o->>'coli')::int, (o->>'qty')::int, o->>'location', o->>'pallet');
      END LOOP;
    END IF;

    items_out := items_out || jsonb_build_array(jsonb_build_object(
      'product_id', v_product_id,
      'unit', unit_label,
      'requested', requested_business,
      'fulfilled', fulfilled_business,
      'status', status_label
    ));
  END LOOP;

  RETURN jsonb_build_object('items', items_out, 'fully_fulfilled', fully_fulfilled);
END;
$function$;

-- 5. Anular movimento
CREATE OR REPLACE FUNCTION public.reverse_stock_movement(p_movement_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  mov public.stock_movements;
  ln RECORD;
  existing_id uuid;
  delta integer;
  new_mov_id uuid;
  uid uuid := auth.uid();
  n_lines integer := 0;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT * INTO mov FROM public.stock_movements WHERE id = p_movement_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Movimento não encontrado';
  END IF;
  IF mov.reversed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Movimento já foi anulado';
  END IF;
  IF mov.reverses_movement_id IS NOT NULL THEN
    RAISE EXCEPTION 'Não é possível anular um movimento de reversão';
  END IF;

  SELECT count(*) INTO n_lines FROM public.stock_movement_lines WHERE movement_id = p_movement_id;
  IF n_lines = 0 THEN
    RAISE EXCEPTION 'Este movimento é anterior ao rastreio por localização e não pode ser anulado automaticamente';
  END IF;

  FOR ln IN SELECT * FROM public.stock_movement_lines WHERE movement_id = p_movement_id LOOP
    IF mov.movement_type = 'entrada' THEN
      delta := -ln.quantity;
    ELSE
      delta := ln.quantity;
    END IF;

    SELECT id INTO existing_id FROM public.counts
    WHERE product_id = ln.product_id
      AND colis_number = ln.colis_number
      AND COALESCE(location,'') = COALESCE(ln.location,'')
      AND COALESCE(pallet_number,'') = COALESCE(ln.pallet_number,'')
    ORDER BY (session_id IS NULL) DESC, quantity DESC
    LIMIT 1;

    IF existing_id IS NOT NULL THEN
      UPDATE public.counts SET quantity = quantity + delta, updated_at = now() WHERE id = existing_id;
    ELSE
      INSERT INTO public.counts (product_id, colis_number, quantity, session_id, location, pallet_number, counted_by)
      VALUES (ln.product_id, ln.colis_number, delta, NULL, ln.location, ln.pallet_number, uid);
    END IF;
  END LOOP;

  INSERT INTO public.stock_movements (product_id, movement_type, quantity, reason, reference, notes, created_by, reverses_movement_id)
  VALUES (
    mov.product_id,
    CASE WHEN mov.movement_type = 'entrada' THEN 'saida' ELSE 'entrada' END,
    mov.quantity,
    'anulação',
    mov.reference,
    'Anulação do movimento ' || mov.id::text,
    uid,
    mov.id
  ) RETURNING id INTO new_mov_id;

  INSERT INTO public.stock_movement_lines (movement_id, product_id, colis_number, quantity, location, pallet_number)
  SELECT new_mov_id, product_id, colis_number, quantity, location, pallet_number
  FROM public.stock_movement_lines WHERE movement_id = p_movement_id;

  UPDATE public.stock_movements
    SET reversed_at = now(), reversed_by = uid
    WHERE id = p_movement_id;

  RETURN jsonb_build_object('status','reversed','movement_id',p_movement_id,'reversal_id',new_mov_id);
END;
$function$;

-- 6. Atribuir localização a stock sem sítio
CREATE OR REPLACE FUNCTION public.assign_count_location(p_count_id uuid, p_location text, p_pallet text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  src RECORD;
  target_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT * INTO src FROM public.counts WHERE id = p_count_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registo não encontrado';
  END IF;

  SELECT id INTO target_id FROM public.counts
  WHERE product_id = src.product_id
    AND colis_number = src.colis_number
    AND id <> src.id
    AND COALESCE(location,'') = COALESCE(NULLIF(p_location,''),'')
    AND COALESCE(pallet_number,'') = COALESCE(NULLIF(p_pallet,''),'')
  ORDER BY quantity DESC
  LIMIT 1;

  IF target_id IS NOT NULL THEN
    UPDATE public.counts SET quantity = quantity + src.quantity, updated_at = now() WHERE id = target_id;
    DELETE FROM public.counts WHERE id = src.id;
    RETURN target_id;
  END IF;

  UPDATE public.counts
    SET location = NULLIF(p_location,''), pallet_number = NULLIF(p_pallet,''), updated_at = now()
    WHERE id = src.id;
  RETURN src.id;
END;
$function$;

-- 7. Vista unificada com novos campos
DROP VIEW IF EXISTS public.stock_movements_unified;
CREATE VIEW public.stock_movements_unified
WITH (security_invoker = on) AS
  SELECT id, product_id, movement_type, quantity, reason, reference, notes, created_by, created_at,
         reversed_at, reverses_movement_id, 'atual'::text AS origem
  FROM public.stock_movements
  UNION ALL
  SELECT id, product_id, movement_type, quantity, reason, reference, notes, created_by, created_at,
         NULL::timestamptz, NULL::uuid, 'arquivo'::text AS origem
  FROM public.stock_movements_archive;

GRANT SELECT ON public.stock_movements_unified TO authenticated;
GRANT SELECT ON public.stock_movements_unified TO service_role;