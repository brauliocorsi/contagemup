-- 1) Retorno: repor a projeção por coli ------------------------------------
CREATE OR REPLACE FUNCTION public.receive_delivery_return(p_attempt_id uuid, p_lines jsonb, p_quarantine_location text DEFAULT 'QUARENTENA-DEV'::text, p_op_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE uid uuid := auth.uid(); a RECORD; ln RECORD; res jsonb;
        v_ok integer; v_dam integer; v_loc text; expected integer; moved integer;
        tot_ok integer := 0; tot_dam integer := 0; exceptions integer := 0; v_mov uuid;
        v_dock text; v_back_to_dock boolean;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF NOT public.is_delivery_manager(uid) THEN RAISE EXCEPTION 'Sem permissão para conferir retornos'; END IF;
  IF p_op_key IS NOT NULL THEN
    SELECT result INTO res FROM public.delivery_operations WHERE op_key = p_op_key;
    IF res IS NOT NULL THEN RETURN res; END IF;
  END IF;

  SELECT * INTO a FROM public.delivery_attempts WHERE id = p_attempt_id FOR UPDATE;
  IF a IS NULL THEN RAISE EXCEPTION 'Tentativa não encontrada'; END IF;
  SELECT dock_location INTO v_dock FROM public.delivery_notes WHERE id = a.note_id;

  FOR ln IN SELECT * FROM public.delivery_attempt_lines WHERE attempt_id = p_attempt_id ORDER BY product_id, colis_number LOOP
    SELECT COALESCE(x.quantity_ok,0), COALESCE(x.quantity_damaged,0), NULLIF(trim(COALESCE(x.location,'')),'')
      INTO v_ok, v_dam, v_loc
      FROM jsonb_to_recordset(COALESCE(p_lines,'[]'::jsonb))
        AS x(line_id uuid, quantity_ok integer, quantity_damaged integer, location text)
     WHERE x.line_id = ln.id;
    v_ok := COALESCE(v_ok,0); v_dam := COALESCE(v_dam,0);
    IF v_ok = 0 AND v_dam = 0 THEN CONTINUE; END IF;

    expected := GREATEST(ln.loaded_quantity - ln.delivered_quantity - ln.return_received_ok - ln.return_received_damaged, 0);
    IF v_ok + v_dam > expected THEN
      RAISE EXCEPTION 'Retorno de % (coli %) acima do esperado: esperado %, indicado %.',
        ln.product_name, ln.colis_number, expected, v_ok + v_dam;
    END IF;

    IF ln.product_id IS NOT NULL THEN
      IF v_ok > 0 THEN
        IF v_loc IS NULL THEN RAISE EXCEPTION 'Indique o destino do retorno de % (coli %).', ln.product_name, ln.colis_number; END IF;
        moved := public.move_stock_qty(ln.product_id, ln.colis_number, v_ok, a.vehicle_location, v_loc);
        IF moved < v_ok THEN
          RAISE EXCEPTION 'Não há % un. de % (coli %) na viatura %.', v_ok, ln.product_name, ln.colis_number, a.vehicle_location;
        END IF;
        INSERT INTO public.stock_movements (product_id, movement_type, quantity, reason, reference, notes, created_by)
        VALUES (ln.product_id, 'transferencia', v_ok, 'retorno_entrega', a.order_number,
          'Retorno recebido: ' || COALESCE(a.vehicle_location,'viatura') || ' -> ' || v_loc, uid)
        RETURNING id INTO v_mov;
        INSERT INTO public.stock_movement_lines (movement_id, product_id, colis_number, quantity, location, location_to)
        VALUES (v_mov, ln.product_id, ln.colis_number, v_ok, a.vehicle_location, v_loc);
      END IF;
      IF v_dam > 0 THEN
        moved := public.move_stock_qty(ln.product_id, ln.colis_number, v_dam, a.vehicle_location, p_quarantine_location);
        IF moved < v_dam THEN
          RAISE EXCEPTION 'Não há % un. avariadas de % (coli %) na viatura %.', v_dam, ln.product_name, ln.colis_number, a.vehicle_location;
        END IF;
        INSERT INTO public.stock_movements (product_id, movement_type, quantity, reason, reference, notes, created_by)
        VALUES (ln.product_id, 'transferencia', v_dam, 'retorno_avariado', a.order_number,
          'Retorno avariado -> ' || p_quarantine_location, uid)
        RETURNING id INTO v_mov;
        INSERT INTO public.stock_movement_lines (movement_id, product_id, colis_number, quantity, location, location_to)
        VALUES (v_mov, ln.product_id, ln.colis_number, v_dam, a.vehicle_location, p_quarantine_location);
      END IF;
    END IF;

    UPDATE public.delivery_attempt_lines
       SET return_received_ok = return_received_ok + v_ok,
           return_received_damaged = return_received_damaged + v_dam,
           return_location = COALESCE(v_loc, p_quarantine_location),
           received_at = now(), received_by = uid,
           exception_note = CASE WHEN v_ok + v_dam < expected
             THEN 'Diferença: esperado ' || expected || ', recebido ' || (v_ok + v_dam) ELSE exception_note END
     WHERE id = ln.id;

    -- Repõe a projeção por coli: o volume deixou a viatura.
    IF ln.note_item_id IS NOT NULL THEN
      v_back_to_dock := v_dam = 0 AND v_loc IS NOT NULL AND v_dock IS NOT NULL
                        AND lower(trim(v_loc)) = lower(trim(v_dock));
      UPDATE public.delivery_note_item_colis c
         SET loaded_quantity = GREATEST(c.loaded_quantity - (v_ok + v_dam), 0),
             staged_quantity = CASE WHEN v_back_to_dock THEN c.staged_quantity
                                    ELSE GREATEST(c.staged_quantity - (v_ok + v_dam), 0) END,
             location = COALESCE(v_loc, p_quarantine_location),
             updated_at = now()
       WHERE c.note_item_id = ln.note_item_id AND c.colis_number = ln.colis_number;

      UPDATE public.delivery_note_items i
         SET loaded_quantity = COALESCE((SELECT MIN(c.loaded_quantity) FROM public.delivery_note_item_colis c WHERE c.note_item_id = i.id), i.loaded_quantity),
             staged_quantity = COALESCE((SELECT MIN(c.staged_quantity) FROM public.delivery_note_item_colis c WHERE c.note_item_id = i.id), i.staged_quantity),
             returned_quantity = i.returned_quantity + v_ok + v_dam,
             updated_at = now()
       WHERE i.id = ln.note_item_id;
    END IF;

    IF v_ok + v_dam < expected THEN exceptions := exceptions + 1; END IF;
    tot_ok := tot_ok + v_ok; tot_dam := tot_dam + v_dam;
  END LOOP;

  INSERT INTO public.delivery_events (note_id, attempt_id, event_type, payload, actor)
  VALUES (a.note_id, a.id, 'retorno_recebido',
    jsonb_build_object('ok', tot_ok, 'damaged', tot_dam, 'exceptions', exceptions), uid);

  res := jsonb_build_object('received_ok', tot_ok, 'received_damaged', tot_dam, 'exceptions', exceptions);
  IF p_op_key IS NOT NULL THEN
    INSERT INTO public.delivery_operations (op_key, kind, attempt_id, actor, result)
    VALUES (p_op_key, 'return', p_attempt_id, uid, res) ON CONFLICT (op_key) DO NOTHING;
  END IF;
  RETURN res;
END $function$;

-- 2) Tentativas ainda não iniciadas acompanham a carga real -----------------
CREATE OR REPLACE FUNCTION public.sync_attempt_lines_from_colis()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.loaded_quantity IS DISTINCT FROM OLD.loaded_quantity THEN
    UPDATE public.delivery_attempt_lines l
       SET loaded_quantity = GREATEST(NEW.loaded_quantity - COALESCE((
             SELECT SUM(l2.delivered_quantity)
               FROM public.delivery_attempt_lines l2
               JOIN public.delivery_attempts a2 ON a2.id = l2.attempt_id
              WHERE l2.note_item_id = NEW.note_item_id
                AND l2.colis_number = NEW.colis_number
                AND a2.status = 'completed'), 0), 0),
           updated_at = now()
      FROM public.delivery_attempts a
     WHERE a.id = l.attempt_id
       AND a.status = 'assigned'
       AND l.note_item_id = NEW.note_item_id
       AND l.colis_number = NEW.colis_number;
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_sync_attempt_lines_from_colis ON public.delivery_note_item_colis;
CREATE TRIGGER trg_sync_attempt_lines_from_colis
AFTER UPDATE OF loaded_quantity ON public.delivery_note_item_colis
FOR EACH ROW EXECUTE FUNCTION public.sync_attempt_lines_from_colis();

-- 3) Caminho agregado do escritório mantém a projeção coerente --------------
CREATE OR REPLACE FUNCTION public.sync_note_item_colis_from_aggregate()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE n integer; v_min_s integer; v_min_l integer;
BEGIN
  SELECT COUNT(*), MIN(staged_quantity), MIN(loaded_quantity)
    INTO n, v_min_s, v_min_l
    FROM public.delivery_note_item_colis WHERE note_item_id = NEW.id;
  IF COALESCE(n,0) = 0 THEN RETURN NEW; END IF;
  IF COALESCE(v_min_s,0) IS DISTINCT FROM NEW.staged_quantity
     OR COALESCE(v_min_l,0) IS DISTINCT FROM NEW.loaded_quantity THEN
    UPDATE public.delivery_note_item_colis
       SET staged_quantity = NEW.staged_quantity,
           loaded_quantity = NEW.loaded_quantity,
           requested_quantity = GREATEST(requested_quantity, NEW.quantity),
           evidence = CASE WHEN evidence = 'scan' THEN 'office_aggregate_override' ELSE 'office_aggregate' END,
           updated_at = now()
     WHERE note_item_id = NEW.id;
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_sync_note_item_colis_from_aggregate ON public.delivery_note_items;
CREATE TRIGGER trg_sync_note_item_colis_from_aggregate
AFTER UPDATE OF staged_quantity, loaded_quantity ON public.delivery_note_items
FOR EACH ROW EXECUTE FUNCTION public.sync_note_item_colis_from_aggregate();

-- 4) Caminho agregado antigo fechado ao operador de armazém -----------------
ALTER FUNCTION public.stage_picking_to_dock(uuid, text, jsonb) RENAME TO stage_picking_to_dock_office;
REVOKE ALL ON FUNCTION public.stage_picking_to_dock_office(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.stage_picking_to_dock(p_task_id uuid, p_dock_location text, p_lines jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_app_role(ARRAY['master','admin','operator']);
  RETURN public.stage_picking_to_dock_office(p_task_id, p_dock_location, p_lines);
END $function$;
REVOKE ALL ON FUNCTION public.stage_picking_to_dock(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stage_picking_to_dock(uuid, text, jsonb) TO authenticated;

ALTER FUNCTION public.load_notes_to_vehicle(uuid[], text, jsonb) RENAME TO load_notes_to_vehicle_office;
REVOKE ALL ON FUNCTION public.load_notes_to_vehicle_office(uuid[], text, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.load_notes_to_vehicle(p_note_ids uuid[], p_vehicle_location text, p_items jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_app_role(ARRAY['master','admin','operator']);
  RETURN public.load_notes_to_vehicle_office(p_note_ids, p_vehicle_location, p_items);
END $function$;
REVOKE ALL ON FUNCTION public.load_notes_to_vehicle(uuid[], text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.load_notes_to_vehicle(uuid[], text, jsonb) TO authenticated;