
-- ============================================================
-- FASE 1: Refactor da camada de stock
-- Counts = fonte de verdade. stock_movements = ledger de auditoria.
-- ============================================================

-- PASSO 1: Backup completo de stock_movements
CREATE TABLE IF NOT EXISTS public.stock_movements_archive (LIKE public.stock_movements INCLUDING ALL);
GRANT SELECT ON public.stock_movements_archive TO authenticated;
GRANT ALL ON public.stock_movements_archive TO service_role;

INSERT INTO public.stock_movements_archive
SELECT * FROM public.stock_movements
ON CONFLICT DO NOTHING;

-- PASSO 2: Remover triggers duplicados e mortos
DROP TRIGGER IF EXISTS trigger_sync_product_stock ON public.counts;
DROP TRIGGER IF EXISTS trigger_sync_damaged_stock ON public.product_damages;

DROP TRIGGER IF EXISTS trigger_sync_stock_on_movement ON public.stock_movements;
DROP FUNCTION IF EXISTS public.sync_stock_on_movement();

DROP TRIGGER IF EXISTS trigger_sync_stock_on_picking ON public.picking_items;
DROP FUNCTION IF EXISTS public.sync_stock_on_picking();

-- PASSO 3: Limpar ledger (archive intocado)
DELETE FROM public.stock_movements;

-- PASSO 4: Colunas estruturadas em product_damages para rastreio de estorno
ALTER TABLE public.product_damages
  ADD COLUMN IF NOT EXISTS source_count_id uuid,
  ADD COLUMN IF NOT EXISTS source_colis_number integer,
  ADD COLUMN IF NOT EXISTS source_location text,
  ADD COLUMN IF NOT EXISTS source_pallet_number text;

-- PASSO 7 (executado antes para libertar nomes): DROPs de funções mortas
DROP FUNCTION IF EXISTS public.sync_counts_with_current_stock();
DROP FUNCTION IF EXISTS public.count_false_movements();
DROP FUNCTION IF EXISTS public.cleanup_false_movements();

-- ============================================================
-- PASSO 5: register_entry
-- ============================================================
CREATE OR REPLACE FUNCTION public.register_entry(
  p_product_id uuid,
  p_colis_quantities jsonb,
  p_location text,
  p_pallet_number text,
  p_reason text,
  p_reference text,
  p_notes text
) RETURNS public.stock_movements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

    SELECT id INTO existing_id
    FROM public.counts
    WHERE product_id = p_product_id
      AND colis_number = coli_num
      AND session_id IS NULL
      AND COALESCE(location,'') = COALESCE(p_location,'')
      AND COALESCE(pallet_number,'') = COALESCE(p_pallet_number,'')
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
$$;

-- ============================================================
-- PASSO 6: commit_exit_cart
-- IMPORTANTE: o retorno (requested/fulfilled/unit) está em UNIDADES DE NEGÓCIO
--   - set completo  -> "set"      (1 set = total_colis colis físicos)
--   - individual    -> "unidade"  (1 unidade = 1 coli físico)
-- Já o ledger stock_movements.quantity é SEMPRE em UNIDADES FÍSICAS (colis efetivamente debitados).
-- Estas duas unidades divergem de propósito.
-- ============================================================
CREATE OR REPLACE FUNCTION public.commit_exit_cart(
  p_items jsonb,
  p_reason text,
  p_reference text,
  p_notes text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

    -- effective_total_colis
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
          SELECT quantity INTO remaining FROM public.counts
            WHERE id = selection."countId" AND product_id = v_product_id;
          IF remaining IS NULL THEN CONTINUE; END IF;
          deduct_amount := LEAST(remaining, selection."quantityToDeduct");
          IF deduct_amount > 0 THEN
            UPDATE public.counts
              SET quantity = quantity - deduct_amount, updated_at = now()
              WHERE id = selection."countId";
            debited_this_coli := debited_this_coli + deduct_amount;
          END IF;
        END LOOP;
      ELSE
        remaining := qty_to_deduct;
        FOR count_row IN
          SELECT id, quantity FROM public.counts
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
        END LOOP;
      END IF;

      per_coli_debited := per_coli_debited || jsonb_build_object(coli_num::text, debited_this_coli);
      total_physical_debited := total_physical_debited + debited_this_coli;
    END LOOP;

    -- Calcular requested/fulfilled em unidade de negócio
    IF v_is_complete THEN
      unit_label := 'set';
      requested_business := v_set_quantity;
      -- fulfilled em sets = MIN debitado entre todos os colis
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

    -- Ledger em UNIDADES FÍSICAS (colis), apenas se debitou algo
    IF total_physical_debited > 0 THEN
      INSERT INTO public.stock_movements (product_id, movement_type, quantity, reason, reference, notes, created_by)
      VALUES (v_product_id, 'saida', total_physical_debited, p_reason, p_reference, p_notes, uid);
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
$$;

-- ============================================================
-- PASSO 7: RPCs de avaria
-- ============================================================
CREATE OR REPLACE FUNCTION public.register_damage(
  p_product_id uuid,
  p_colis_number integer,
  p_quantity integer,
  p_damage_type text,
  p_description text,
  p_location text,
  p_pallet_number text
) RETURNS public.product_damages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_count RECORD;
  remaining integer := p_quantity;
  deduct_amount integer;
  first_source_id uuid;
  dmg public.product_damages;
  uid uuid := auth.uid();
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'quantity must be > 0';
  END IF;

  FOR target_count IN
    SELECT id, quantity, location, pallet_number FROM public.counts
    WHERE product_id = p_product_id
      AND colis_number = p_colis_number
      AND quantity > 0
      AND (p_location IS NULL OR COALESCE(location,'') = COALESCE(p_location,''))
      AND (p_pallet_number IS NULL OR COALESCE(pallet_number,'') = COALESCE(p_pallet_number,''))
    ORDER BY quantity DESC
  LOOP
    EXIT WHEN remaining <= 0;
    deduct_amount := LEAST(target_count.quantity, remaining);
    UPDATE public.counts
      SET quantity = quantity - deduct_amount, updated_at = now()
      WHERE id = target_count.id;
    IF first_source_id IS NULL THEN
      first_source_id := target_count.id;
    END IF;
    remaining := remaining - deduct_amount;
  END LOOP;

  IF remaining > 0 THEN
    RAISE EXCEPTION 'Insufficient stock to register damage (% short)', remaining;
  END IF;

  INSERT INTO public.product_damages (
    product_id, colis_number, quantity, damage_type, description,
    location, pallet_number, reported_by, status,
    source_count_id, source_colis_number, source_location, source_pallet_number
  ) VALUES (
    p_product_id, p_colis_number, p_quantity, p_damage_type, p_description,
    p_location, p_pallet_number, uid, 'active',
    first_source_id, p_colis_number, p_location, p_pallet_number
  ) RETURNING * INTO dmg;

  INSERT INTO public.stock_movements (product_id, movement_type, quantity, reason, notes, created_by)
  VALUES (p_product_id, 'saida', p_quantity, 'avaria', p_description, uid);

  RETURN dmg;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_damage(
  p_damage_id uuid,
  p_resolution_type text,
  p_resolution_notes text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dmg public.product_damages;
  existing_id uuid;
  uid uuid := auth.uid();
BEGIN
  SELECT * INTO dmg FROM public.product_damages WHERE id = p_damage_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Damage % not found', p_damage_id;
  END IF;

  IF dmg.status = 'resolved' THEN
    RAISE NOTICE 'Damage % already resolved at %', p_damage_id, dmg.resolved_at;
    RETURN jsonb_build_object('status','already_resolved','damage_id',p_damage_id,'resolved_at',dmg.resolved_at);
  END IF;

  -- Estorno aos counts (estrutura, não parsing de notes)
  SELECT id INTO existing_id FROM public.counts
  WHERE product_id = dmg.product_id
    AND colis_number = COALESCE(dmg.source_colis_number, dmg.colis_number)
    AND session_id IS NULL
    AND COALESCE(location,'') = COALESCE(dmg.source_location, dmg.location, '')
    AND COALESCE(pallet_number,'') = COALESCE(dmg.source_pallet_number, dmg.pallet_number, '')
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    UPDATE public.counts
      SET quantity = quantity + dmg.quantity, updated_at = now()
      WHERE id = existing_id;
  ELSE
    INSERT INTO public.counts (product_id, colis_number, quantity, session_id, location, pallet_number, counted_by)
    VALUES (
      dmg.product_id,
      COALESCE(dmg.source_colis_number, dmg.colis_number),
      dmg.quantity,
      NULL,
      COALESCE(dmg.source_location, dmg.location),
      COALESCE(dmg.source_pallet_number, dmg.pallet_number),
      uid
    );
  END IF;

  UPDATE public.product_damages
    SET status = 'resolved',
        resolved_at = now(),
        resolution_type = p_resolution_type,
        resolution_notes = p_resolution_notes,
        updated_at = now()
    WHERE id = p_damage_id;

  INSERT INTO public.stock_movements (product_id, movement_type, quantity, reason, notes, created_by)
  VALUES (dmg.product_id, 'entrada', dmg.quantity, 'avaria_resolvida', p_resolution_notes, uid);

  RETURN jsonb_build_object('status','resolved','damage_id',p_damage_id);
END;
$$;

-- ============================================================
-- PASSO 8: Segurança
-- ============================================================
REVOKE ALL ON FUNCTION public.register_entry(uuid, jsonb, text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.commit_exit_cart(jsonb, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.register_damage(uuid, integer, integer, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_damage(uuid, text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.register_entry(uuid, jsonb, text, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.commit_exit_cart(jsonb, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.register_damage(uuid, integer, integer, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_damage(uuid, text, text) TO authenticated, service_role;
