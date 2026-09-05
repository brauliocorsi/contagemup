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
  v_route uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  v_dock := NULLIF(trim(COALESCE(p_dock_location,'')), '');
  IF v_dock IS NULL THEN RAISE EXCEPTION 'Localização de pré-saída obrigatória'; END IF;

  SELECT route_id INTO v_route FROM public.scanner_picking_tasks WHERE id = p_task_id;

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
      INSERT INTO public.delivery_notes (order_number, task_id, client_name, status, dock_location, created_by, staged_at, route_id)
      VALUES (v_order, p_task_id, NULLIF(ln->>'client_name',''), 'staged', v_dock, uid, now(), v_route)
      RETURNING id INTO v_note;
      notes_out := notes_out || jsonb_build_array(v_order);
    ELSE
      UPDATE public.delivery_notes SET dock_location = v_dock, staged_at = COALESCE(staged_at, now()),
        route_id = COALESCE(route_id, v_route),
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