-- Helper: debitar counts numa localização concreta
CREATE OR REPLACE FUNCTION public.debit_counts_at(p_product uuid, p_coli integer, p_qty integer, p_location text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cr RECORD; remaining integer := GREATEST(COALESCE(p_qty,0),0); take integer; done integer := 0;
BEGIN
  IF remaining = 0 THEN RETURN 0; END IF;
  FOR cr IN
    SELECT id, quantity FROM public.counts
    WHERE product_id = p_product AND colis_number = p_coli AND quantity > 0
      AND COALESCE(location,'') = COALESCE(p_location,'')
    ORDER BY quantity DESC FOR UPDATE
  LOOP
    EXIT WHEN remaining <= 0;
    take := LEAST(cr.quantity, remaining);
    UPDATE public.counts SET quantity = quantity - take, updated_at = now() WHERE id = cr.id;
    remaining := remaining - take; done := done + take;
  END LOOP;
  RETURN done;
END $$;

-- 1) Atribuir tentativas ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_delivery_attempts(
  p_note_ids uuid[], p_driver uuid, p_scheduled_date date DEFAULT NULL, p_op_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); nt RECORD; it RECORD; v_att uuid; v_num integer;
        v_total integer; coli integer; created integer := 0; res jsonb; v_partial boolean;
        v_reason text; out_ids jsonb := '[]'::jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF NOT public.is_delivery_manager(uid) THEN RAISE EXCEPTION 'Sem permissão para atribuir entregas'; END IF;
  IF p_op_key IS NOT NULL THEN
    SELECT result INTO res FROM public.delivery_operations WHERE op_key = p_op_key;
    IF res IS NOT NULL THEN RETURN res; END IF;
  END IF;
  IF p_driver IS NULL THEN RAISE EXCEPTION 'Entregador obrigatório'; END IF;

  FOR nt IN SELECT * FROM public.delivery_notes WHERE id = ANY(p_note_ids) FOR UPDATE LOOP
    IF nt.status = 'cancelled' THEN
      RAISE EXCEPTION 'Encomenda % está cancelada e não pode ser agendada', nt.order_number;
    END IF;
    IF EXISTS (SELECT 1 FROM public.delivery_attempts a
               WHERE a.note_id = nt.id AND a.status IN ('assigned','in_transit')) THEN
      RAISE EXCEPTION 'A encomenda % já tem uma tentativa em curso', nt.order_number;
    END IF;

    SELECT COALESCE(MAX(attempt_number),0) + 1 INTO v_num FROM public.delivery_attempts WHERE note_id = nt.id;
    SELECT EXISTS (SELECT 1 FROM public.delivery_note_items i
                   WHERE i.note_id = nt.id AND i.loaded_quantity < i.quantity) INTO v_partial;
    SELECT string_agg(DISTINCT ti.shortage_reason, ', ') INTO v_reason
      FROM public.scanner_picking_task_items ti
     WHERE ti.task_id = nt.task_id AND ti.shortage_quantity > 0 AND ti.shortage_reason IS NOT NULL;

    INSERT INTO public.delivery_attempts (
      note_id, route_id, attempt_number, driver_id, scheduled_date, vehicle_location,
      order_number, client_name, address, delivery_instructions,
      partial_load, partial_load_reason, assigned_by)
    VALUES (nt.id, nt.route_id, v_num, p_driver, p_scheduled_date, nt.vehicle_location,
      nt.order_number, nt.client_name, nt.address, nt.delivery_instructions,
      COALESCE(v_partial,false), v_reason, uid)
    RETURNING id INTO v_att;

    FOR it IN SELECT * FROM public.delivery_note_items WHERE note_id = nt.id LOOP
      v_total := CASE WHEN it.product_id IS NULL THEN 1 ELSE public.effective_total_colis(it.product_id) END;
      IF v_total < 1 THEN v_total := 1; END IF;
      FOR coli IN 1..v_total LOOP
        INSERT INTO public.delivery_attempt_lines (
          attempt_id, note_item_id, product_id, product_code, product_name, details,
          colis_number, ordered_quantity, loaded_quantity)
        VALUES (v_att, it.id, it.product_id, it.product_code, it.product_name, it.details,
          coli, GREATEST(it.quantity - it.delivered_quantity, 0),
          GREATEST(it.loaded_quantity - it.delivered_quantity, 0))
        ON CONFLICT (attempt_id, note_item_id, colis_number) DO NOTHING;
      END LOOP;
    END LOOP;

    INSERT INTO public.delivery_events (note_id, attempt_id, event_type, payload, actor)
    VALUES (nt.id, v_att, 'tentativa_atribuida',
      jsonb_build_object('driver', p_driver, 'date', p_scheduled_date, 'attempt', v_num), uid);

    created := created + 1;
    out_ids := out_ids || jsonb_build_array(v_att);
  END LOOP;

  res := jsonb_build_object('created', created, 'attempts', out_ids);
  IF p_op_key IS NOT NULL THEN
    INSERT INTO public.delivery_operations (op_key, kind, actor, result)
    VALUES (p_op_key, 'assign', uid, res) ON CONFLICT (op_key) DO NOTHING;
  END IF;
  RETURN res;
END $$;

-- 2) Iniciar tentativa ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_delivery_attempt(p_attempt_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); a RECORD;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT * INTO a FROM public.delivery_attempts WHERE id = p_attempt_id FOR UPDATE;
  IF a IS NULL THEN RAISE EXCEPTION 'Tentativa não encontrada'; END IF;
  IF a.driver_id <> uid AND NOT public.is_delivery_manager(uid) THEN
    RAISE EXCEPTION 'Entrega não atribuída a este utilizador';
  END IF;
  IF a.status = 'assigned' THEN
    UPDATE public.delivery_attempts SET status = 'in_transit', started_at = now(), version = version + 1
    WHERE id = p_attempt_id;
    INSERT INTO public.delivery_events (note_id, attempt_id, event_type, actor)
    VALUES (a.note_id, a.id, 'tentativa_iniciada', uid);
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

-- 3) Confirmar entrega ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_delivery_attempt(
  p_attempt_id uuid, p_lines jsonb, p_failure_reason text DEFAULT NULL,
  p_failure_notes text DEFAULT NULL, p_op_key text DEFAULT NULL,
  p_expected_version integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); a RECORD; ln RECORD; v_qty integer; v_reason text;
        v_debited integer; v_mov uuid; res jsonb; total_del integer := 0; total_load integer := 0;
        v_outcome text; it RECORD; v_min integer; nt RECORD; v_all_done boolean; v_any boolean;
        v_movsum integer;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF p_op_key IS NOT NULL THEN
    SELECT result INTO res FROM public.delivery_operations WHERE op_key = p_op_key;
    IF res IS NOT NULL THEN RETURN res; END IF;
  END IF;

  SELECT * INTO a FROM public.delivery_attempts WHERE id = p_attempt_id FOR UPDATE;
  IF a IS NULL THEN RAISE EXCEPTION 'Tentativa não encontrada'; END IF;
  IF a.driver_id <> uid AND NOT public.is_delivery_manager(uid) THEN
    RAISE EXCEPTION 'Entrega não atribuída a este utilizador';
  END IF;
  IF a.status IN ('completed','cancelled') THEN
    RAISE EXCEPTION 'Esta tentativa já foi fechada (%).', a.status;
  END IF;
  IF p_expected_version IS NOT NULL AND p_expected_version <> a.version THEN
    RAISE EXCEPTION 'A entrega foi alterada noutro dispositivo. Atualize antes de confirmar.';
  END IF;

  -- validação prévia: nunca entregar acima do carregado nesta tentativa
  FOR ln IN SELECT * FROM public.delivery_attempt_lines WHERE attempt_id = p_attempt_id ORDER BY id LOOP
    SELECT COALESCE(x.delivered_quantity,0), NULLIF(trim(COALESCE(x.reason,'')),'')
      INTO v_qty, v_reason
      FROM jsonb_to_recordset(COALESCE(p_lines,'[]'::jsonb))
        AS x(line_id uuid, delivered_quantity integer, reason text)
     WHERE x.line_id = ln.id;
    v_qty := COALESCE(v_qty, 0);
    IF v_qty < 0 THEN RAISE EXCEPTION 'Quantidade inválida em %', ln.product_name; END IF;
    IF v_qty > ln.loaded_quantity THEN
      RAISE EXCEPTION 'Não pode entregar % un. de % (coli %): só há % carregadas nesta entrega.',
        v_qty, ln.product_name, ln.colis_number, ln.loaded_quantity;
    END IF;
    total_load := total_load + ln.loaded_quantity;
  END LOOP;

  -- execução
  FOR ln IN SELECT * FROM public.delivery_attempt_lines WHERE attempt_id = p_attempt_id ORDER BY product_id, colis_number LOOP
    SELECT COALESCE(x.delivered_quantity,0), NULLIF(trim(COALESCE(x.reason,'')),'')
      INTO v_qty, v_reason
      FROM jsonb_to_recordset(COALESCE(p_lines,'[]'::jsonb))
        AS x(line_id uuid, delivered_quantity integer, reason text)
     WHERE x.line_id = ln.id;
    v_qty := COALESCE(v_qty, 0);

    IF v_qty > 0 AND ln.product_id IS NOT NULL THEN
      v_debited := public.debit_counts_at(ln.product_id, ln.colis_number, v_qty, a.vehicle_location);
      IF v_debited < v_qty THEN
        RAISE EXCEPTION 'Stock insuficiente na viatura % para % (coli %): pedido %, disponível %.',
          COALESCE(a.vehicle_location,'?'), ln.product_name, ln.colis_number, v_qty, v_debited;
      END IF;
      INSERT INTO public.stock_movements (product_id, movement_type, quantity, reason, reference, notes, created_by)
      VALUES (ln.product_id, 'saida', v_qty, 'entrega', a.order_number,
        'Entrega ao cliente (tentativa ' || a.attempt_number || ') coli ' || ln.colis_number, uid)
      RETURNING id INTO v_mov;
      INSERT INTO public.stock_movement_lines (movement_id, product_id, colis_number, quantity, location)
      VALUES (v_mov, ln.product_id, ln.colis_number, v_qty, a.vehicle_location);
    END IF;

    UPDATE public.delivery_attempt_lines
       SET delivered_quantity = v_qty,
           undelivered_reason = CASE WHEN v_qty < ln.loaded_quantity
             THEN COALESCE(v_reason, p_failure_reason) ELSE NULL END
     WHERE id = ln.id;
    total_del := total_del + v_qty;
  END LOOP;

  -- saldo por artigo da encomenda: conjunto completo = mínimo entre colis
  FOR it IN SELECT DISTINCT note_item_id FROM public.delivery_attempt_lines
             WHERE attempt_id = p_attempt_id AND note_item_id IS NOT NULL LOOP
    SELECT MIN(delivered_quantity) INTO v_min FROM public.delivery_attempt_lines
     WHERE attempt_id = p_attempt_id AND note_item_id = it.note_item_id;
    UPDATE public.delivery_note_items
       SET delivered_quantity = LEAST(quantity, delivered_quantity + COALESCE(v_min,0)), updated_at = now()
     WHERE id = it.note_item_id;
  END LOOP;

  IF total_load > 0 AND total_del = total_load THEN v_outcome := 'delivered_full';
  ELSIF total_del > 0 THEN v_outcome := 'delivered_partial';
  ELSE v_outcome := 'not_delivered'; END IF;

  IF v_outcome <> 'delivered_full' AND NULLIF(trim(COALESCE(p_failure_reason,'')),'') IS NULL THEN
    RAISE EXCEPTION 'Indique o motivo do que não foi entregue.';
  END IF;

  UPDATE public.delivery_attempts
     SET status = 'completed', outcome = v_outcome, completed_at = now(), completed_by = uid,
         failure_reason = NULLIF(trim(COALESCE(p_failure_reason,'')),''),
         failure_notes = NULLIF(trim(COALESCE(p_failure_notes,'')),''),
         version = version + 1
   WHERE id = p_attempt_id;

  SELECT * INTO nt FROM public.delivery_notes WHERE id = a.note_id FOR UPDATE;
  SELECT NOT EXISTS (SELECT 1 FROM public.delivery_note_items WHERE note_id = a.note_id AND delivered_quantity < quantity),
         EXISTS (SELECT 1 FROM public.delivery_note_items WHERE note_id = a.note_id AND delivered_quantity > 0)
    INTO v_all_done, v_any;

  UPDATE public.delivery_notes
     SET status = CASE WHEN v_all_done THEN 'delivered'
                       WHEN v_any THEN 'partial'
                       ELSE 'not_delivered' END,
         delivered_at = CASE WHEN v_all_done THEN now() ELSE delivered_at END,
         delivered_by = CASE WHEN v_all_done THEN uid ELSE delivered_by END,
         cancellation_requested = cancellation_requested OR (p_failure_reason = 'pedido_cancelamento'),
         cancellation_reason = CASE WHEN p_failure_reason = 'pedido_cancelamento'
            THEN COALESCE(NULLIF(trim(COALESCE(p_failure_notes,'')),''), 'Pedido do cliente') ELSE cancellation_reason END,
         reschedule_requested = reschedule_requested OR (p_failure_reason = 'reagendamento'),
         version = version + 1
   WHERE id = a.note_id;

  INSERT INTO public.delivery_events (note_id, attempt_id, event_type, payload, actor)
  VALUES (a.note_id, a.id, 'entrega_confirmada',
    jsonb_build_object('outcome', v_outcome, 'delivered', total_del, 'loaded', total_load,
      'reason', p_failure_reason, 'notes', p_failure_notes), uid);

  res := jsonb_build_object('outcome', v_outcome, 'delivered', total_del, 'loaded', total_load,
    'return_expected', total_load - total_del, 'order_number', a.order_number);
  IF p_op_key IS NOT NULL THEN
    INSERT INTO public.delivery_operations (op_key, kind, attempt_id, actor, result)
    VALUES (p_op_key, 'confirm', p_attempt_id, uid, res) ON CONFLICT (op_key) DO NOTHING;
  END IF;
  RETURN res;
END $$;

-- 4) Receber retorno no armazém --------------------------------------------
CREATE OR REPLACE FUNCTION public.receive_delivery_return(
  p_attempt_id uuid, p_lines jsonb, p_quarantine_location text DEFAULT 'QUARENTENA-DEV',
  p_op_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); a RECORD; ln RECORD; res jsonb;
        v_ok integer; v_dam integer; v_loc text; expected integer; moved integer;
        tot_ok integer := 0; tot_dam integer := 0; exceptions integer := 0; v_mov uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF NOT public.is_delivery_manager(uid) THEN RAISE EXCEPTION 'Sem permissão para conferir retornos'; END IF;
  IF p_op_key IS NOT NULL THEN
    SELECT result INTO res FROM public.delivery_operations WHERE op_key = p_op_key;
    IF res IS NOT NULL THEN RETURN res; END IF;
  END IF;

  SELECT * INTO a FROM public.delivery_attempts WHERE id = p_attempt_id FOR UPDATE;
  IF a IS NULL THEN RAISE EXCEPTION 'Tentativa não encontrada'; END IF;

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
END $$;

-- 5) Reagendar --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reschedule_delivery_note(
  p_note_id uuid, p_scheduled_date date, p_driver uuid DEFAULT NULL, p_op_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); nt RECORD; it RECORD; v_att uuid; v_num integer; res jsonb;
        v_total integer; coli integer; v_onboard integer; v_outstanding integer; v_veh text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF NOT public.is_delivery_manager(uid) THEN RAISE EXCEPTION 'Sem permissão para reagendar'; END IF;
  IF p_op_key IS NOT NULL THEN
    SELECT result INTO res FROM public.delivery_operations WHERE op_key = p_op_key;
    IF res IS NOT NULL THEN RETURN res; END IF;
  END IF;
  IF p_scheduled_date IS NULL THEN RAISE EXCEPTION 'Indique a nova data'; END IF;

  SELECT * INTO nt FROM public.delivery_notes WHERE id = p_note_id FOR UPDATE;
  IF nt IS NULL THEN RAISE EXCEPTION 'Encomenda não encontrada'; END IF;
  IF nt.status = 'cancelled' THEN RAISE EXCEPTION 'Encomenda cancelada: não pode ser reagendada'; END IF;
  IF EXISTS (SELECT 1 FROM public.delivery_attempts WHERE note_id = p_note_id AND status IN ('assigned','in_transit')) THEN
    RAISE EXCEPTION 'Já existe uma tentativa em curso para esta encomenda';
  END IF;

  SELECT COALESCE(MAX(attempt_number),0) + 1 INTO v_num FROM public.delivery_attempts WHERE note_id = p_note_id;
  SELECT vehicle_location INTO v_veh FROM public.delivery_attempts
   WHERE note_id = p_note_id ORDER BY attempt_number DESC LIMIT 1;

  INSERT INTO public.delivery_attempts (
    note_id, route_id, attempt_number, driver_id, scheduled_date, vehicle_location,
    order_number, client_name, address, delivery_instructions, assigned_by)
  VALUES (p_note_id, nt.route_id, v_num, p_driver, p_scheduled_date, v_veh,
    nt.order_number, nt.client_name, nt.address, nt.delivery_instructions, uid)
  RETURNING id INTO v_att;

  FOR it IN SELECT * FROM public.delivery_note_items WHERE note_id = p_note_id LOOP
    v_outstanding := GREATEST(it.quantity - it.delivered_quantity, 0);
    CONTINUE WHEN v_outstanding = 0;
    v_total := CASE WHEN it.product_id IS NULL THEN 1 ELSE public.effective_total_colis(it.product_id) END;
    IF v_total < 1 THEN v_total := 1; END IF;
    FOR coli IN 1..v_total LOOP
      -- mercadoria ainda na viatura (não entregue e ainda não recebida no armazém)
      SELECT COALESCE(SUM(GREATEST(l.loaded_quantity - l.delivered_quantity - l.return_received_ok - l.return_received_damaged,0)),0)
        INTO v_onboard
        FROM public.delivery_attempt_lines l
        JOIN public.delivery_attempts pa ON pa.id = l.attempt_id
       WHERE pa.note_id = p_note_id AND l.note_item_id = it.id AND l.colis_number = coli;

      INSERT INTO public.delivery_attempt_lines (
        attempt_id, note_item_id, product_id, product_code, product_name, details,
        colis_number, ordered_quantity, loaded_quantity)
      VALUES (v_att, it.id, it.product_id, it.product_code, it.product_name, it.details,
        coli, v_outstanding, LEAST(v_onboard, v_outstanding));
    END LOOP;
  END LOOP;

  UPDATE public.delivery_notes
     SET reschedule_requested = false, status = 'staged', version = version + 1
   WHERE id = p_note_id;

  INSERT INTO public.delivery_events (note_id, attempt_id, event_type, payload, actor)
  VALUES (p_note_id, v_att, 'reagendada',
    jsonb_build_object('date', p_scheduled_date, 'driver', p_driver, 'attempt', v_num), uid);

  res := jsonb_build_object('attempt_id', v_att, 'attempt_number', v_num);
  IF p_op_key IS NOT NULL THEN
    INSERT INTO public.delivery_operations (op_key, kind, attempt_id, actor, result)
    VALUES (p_op_key, 'reschedule', v_att, uid, res) ON CONFLICT (op_key) DO NOTHING;
  END IF;
  RETURN res;
END $$;

-- 6) Cancelar encomenda -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_delivery_note(
  p_note_id uuid, p_reason text, p_op_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); nt RECORD; res jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF NOT public.is_delivery_manager(uid) THEN RAISE EXCEPTION 'Sem permissão para cancelar'; END IF;
  IF p_op_key IS NOT NULL THEN
    SELECT result INTO res FROM public.delivery_operations WHERE op_key = p_op_key;
    IF res IS NOT NULL THEN RETURN res; END IF;
  END IF;

  SELECT * INTO nt FROM public.delivery_notes WHERE id = p_note_id FOR UPDATE;
  IF nt IS NULL THEN RAISE EXCEPTION 'Encomenda não encontrada'; END IF;

  UPDATE public.delivery_attempts SET status = 'cancelled', version = version + 1
   WHERE note_id = p_note_id AND status IN ('assigned','in_transit');

  UPDATE public.delivery_notes
     SET status = 'cancelled', cancelled_at = now(), cancelled_by = uid,
         cancellation_reason = COALESCE(NULLIF(trim(COALESCE(p_reason,'')),''), cancellation_reason),
         cancellation_requested = false, reschedule_requested = false, version = version + 1
   WHERE id = p_note_id;

  INSERT INTO public.delivery_events (note_id, event_type, payload, actor)
  VALUES (p_note_id, 'encomenda_cancelada', jsonb_build_object('reason', p_reason), uid);

  res := jsonb_build_object('ok', true, 'order_number', nt.order_number);
  IF p_op_key IS NOT NULL THEN
    INSERT INTO public.delivery_operations (op_key, kind, actor, result)
    VALUES (p_op_key, 'cancel', uid, res) ON CONFLICT (op_key) DO NOTHING;
  END IF;
  RETURN res;
END $$;