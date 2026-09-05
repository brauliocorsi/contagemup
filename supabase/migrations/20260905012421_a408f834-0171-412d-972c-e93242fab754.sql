ALTER TABLE public.stock_movement_lines ADD COLUMN IF NOT EXISTS location_to text;

ALTER TABLE public.scanner_picking_task_items
  ADD COLUMN IF NOT EXISTS shortage_quantity integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shortage_reason text,
  ADD COLUMN IF NOT EXISTS shortage_notes text,
  ADD COLUMN IF NOT EXISTS picked_location text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scanner_picking_task_items_shortage_reason_check') THEN
    ALTER TABLE public.scanner_picking_task_items
      ADD CONSTRAINT scanner_picking_task_items_shortage_reason_check
      CHECK (shortage_reason IS NULL OR shortage_reason IN
        ('nao_estava_la','avariado','quantidade_insuficiente','localizacao_errada','outro'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.stage_picking_to_dock(p_task_id uuid, p_dock_location text, p_lines jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  ln jsonb; v_note uuid; v_order text; v_pid uuid; v_qty integer;
  v_total integer; coli integer; v_moved integer; v_min integer;
  uid uuid := auth.uid(); notes_out jsonb := '[]'::jsonb; v_dock text;
  v_from text; v_item uuid; v_mov uuid; v_missing integer;
  lines_out jsonb := '[]'::jsonb; partial_count integer := 0;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  v_dock := NULLIF(trim(COALESCE(p_dock_location,'')), '');
  IF v_dock IS NULL THEN RAISE EXCEPTION 'Localização de pré-saída obrigatória'; END IF;

  FOR ln IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_order := NULLIF(trim(COALESCE(ln->>'order_number','')), '');
    IF v_order IS NULL THEN v_order := 'SEM-NOTA'; END IF;
    v_pid := NULLIF(ln->>'product_id','')::uuid;
    v_qty := COALESCE((ln->>'quantity')::integer, 0);
    v_from := NULLIF(trim(COALESCE(ln->>'from_location','')), '');
    v_item := NULLIF(ln->>'item_id','')::uuid;
    IF v_qty <= 0 THEN CONTINUE; END IF;

    SELECT id INTO v_note FROM public.delivery_notes
      WHERE order_number = v_order AND status IN ('picking','staged','loaded') LIMIT 1;
    IF v_note IS NULL THEN
      INSERT INTO public.delivery_notes (order_number, task_id, client_name, status, dock_location, created_by, staged_at)
      VALUES (v_order, p_task_id, NULLIF(ln->>'client_name',''), 'staged', v_dock, uid, now())
      RETURNING id INTO v_note;
      notes_out := notes_out || jsonb_build_array(v_order);
    ELSE
      UPDATE public.delivery_notes SET dock_location = v_dock, staged_at = COALESCE(staged_at, now()),
        status = CASE WHEN status = 'picking' THEN 'staged' ELSE status END
      WHERE id = v_note;
    END IF;

    v_min := NULL;
    v_mov := NULL;
    IF v_pid IS NOT NULL THEN
      v_total := public.effective_total_colis(v_pid);
      FOR coli IN 1..v_total LOOP
        v_moved := public.move_stock_qty(v_pid, coli, v_qty, v_from, v_dock);
        IF v_min IS NULL OR v_moved < v_min THEN v_min := v_moved; END IF;
        IF v_moved > 0 THEN
          IF v_mov IS NULL THEN
            INSERT INTO public.stock_movements (product_id, movement_type, quantity, reason, reference, notes, created_by)
            VALUES (v_pid, 'transferencia', v_qty, 'picking_para_doca', v_order,
              'Picking: ' || COALESCE(v_from,'origem não especificada') || ' -> ' || v_dock, uid)
            RETURNING id INTO v_mov;
          END IF;
          INSERT INTO public.stock_movement_lines (movement_id, product_id, colis_number, quantity, location, location_to)
          VALUES (v_mov, v_pid, coli, v_moved, v_from, v_dock);
        END IF;
      END LOOP;
      IF v_mov IS NOT NULL AND COALESCE(v_min,0) <> v_qty THEN
        UPDATE public.stock_movements SET quantity = COALESCE(v_min,0) WHERE id = v_mov;
      END IF;
    END IF;

    v_missing := GREATEST(v_qty - COALESCE(v_min,0), 0);
    IF v_missing > 0 THEN partial_count := partial_count + 1; END IF;

    IF v_item IS NOT NULL THEN
      UPDATE public.scanner_picking_task_items
      SET shortage_quantity = v_missing,
          shortage_reason = CASE WHEN v_missing > 0
            THEN NULLIF(trim(COALESCE(ln->>'shortage_reason','')), '') ELSE NULL END,
          shortage_notes = CASE WHEN v_missing > 0
            THEN NULLIF(trim(COALESCE(ln->>'shortage_notes','')), '') ELSE NULL END,
          picked_location = v_from,
          updated_at = now()
      WHERE id = v_item;
    END IF;

    INSERT INTO public.delivery_note_items (
      note_id, product_id, product_code, product_name, details, quantity, staged_quantity, location)
    VALUES (v_note, v_pid, COALESCE(ln->>'product_code',''), COALESCE(ln->>'product_name','?'),
      NULLIF(ln->>'details',''), v_qty, COALESCE(v_min, 0), v_dock);

    lines_out := lines_out || jsonb_build_array(jsonb_build_object(
      'product_code', COALESCE(ln->>'product_code',''),
      'product_name', COALESCE(ln->>'product_name','?'),
      'order_number', v_order,
      'requested', v_qty,
      'moved', COALESCE(v_min,0),
      'missing', v_missing,
      'from_location', v_from,
      'origin_unspecified', (v_from IS NULL),
      'shortage_reason', NULLIF(trim(COALESCE(ln->>'shortage_reason','')), '')
    ));
  END LOOP;

  RETURN jsonb_build_object('notes', notes_out, 'dock', v_dock,
    'lines', lines_out, 'partial_lines', partial_count);
END; $function$;

CREATE OR REPLACE FUNCTION public.load_notes_to_vehicle(p_note_ids uuid[], p_vehicle_location text, p_items jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  it RECORD; v_qty integer; v_total integer; coli integer; v_moved integer; v_min integer;
  uid uuid := auth.uid(); v_veh text; loaded integer := 0; n uuid; v_pending integer;
  partial integer := 0; v_mov uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  v_veh := NULLIF(trim(COALESCE(p_vehicle_location,'')), '');
  IF v_veh IS NULL THEN RAISE EXCEPTION 'Viatura obrigatória'; END IF;

  FOR it IN
    SELECT i.*, dn.dock_location, dn.order_number FROM public.delivery_note_items i
    JOIN public.delivery_notes dn ON dn.id = i.note_id
    WHERE i.note_id = ANY(p_note_ids)
  LOOP
    IF jsonb_array_length(COALESCE(p_items,'[]'::jsonb)) > 0 THEN
      SELECT COALESCE(x.quantity, 0) INTO v_qty
      FROM jsonb_to_recordset(p_items) AS x(item_id uuid, quantity integer)
      WHERE x.item_id = it.id;
      v_qty := COALESCE(v_qty, 0);
    ELSE
      v_qty := GREATEST(it.staged_quantity - it.loaded_quantity, 0);
    END IF;
    IF v_qty <= 0 THEN CONTINUE; END IF;

    v_min := v_qty;
    v_mov := NULL;
    IF it.product_id IS NOT NULL THEN
      v_total := public.effective_total_colis(it.product_id);
      v_min := NULL;
      FOR coli IN 1..v_total LOOP
        v_moved := public.move_stock_qty(it.product_id, coli, v_qty, it.dock_location, v_veh);
        IF v_min IS NULL OR v_moved < v_min THEN v_min := v_moved; END IF;
        IF v_moved > 0 THEN
          IF v_mov IS NULL THEN
            INSERT INTO public.stock_movements (product_id, movement_type, quantity, reason, reference, notes, created_by)
            VALUES (it.product_id, 'transferencia', v_qty, 'carga_para_viatura', it.order_number,
              'Carga: ' || COALESCE(it.dock_location,'cais') || ' -> ' || v_veh, uid)
            RETURNING id INTO v_mov;
          END IF;
          INSERT INTO public.stock_movement_lines (movement_id, product_id, colis_number, quantity, location, location_to)
          VALUES (v_mov, it.product_id, coli, v_moved, it.dock_location, v_veh);
        END IF;
      END LOOP;
      IF v_mov IS NOT NULL AND COALESCE(v_min,0) <> v_qty THEN
        UPDATE public.stock_movements SET quantity = COALESCE(v_min,0) WHERE id = v_mov;
      END IF;
    END IF;

    UPDATE public.delivery_note_items
    SET loaded_quantity = loaded_quantity + COALESCE(v_min,0), location = v_veh, updated_at = now()
    WHERE id = it.id;
    loaded := loaded + COALESCE(v_min,0);
  END LOOP;

  FOREACH n IN ARRAY p_note_ids LOOP
    SELECT COALESCE(SUM(GREATEST(i.staged_quantity - i.loaded_quantity, 0)), 0)
      INTO v_pending
    FROM public.delivery_note_items i WHERE i.note_id = n;

    IF v_pending > 0 THEN
      partial := partial + 1;
      UPDATE public.delivery_notes
      SET vehicle_location = v_veh
      WHERE id = n AND status IN ('picking','staged');
    ELSE
      UPDATE public.delivery_notes
      SET status = 'loaded', vehicle_location = v_veh, loaded_at = COALESCE(loaded_at, now())
      WHERE id = n AND status IN ('picking','staged','loaded');
    END IF;
  END LOOP;

  RETURN jsonb_build_object('loaded', loaded, 'vehicle', v_veh, 'partial_notes', partial);
END; $function$;