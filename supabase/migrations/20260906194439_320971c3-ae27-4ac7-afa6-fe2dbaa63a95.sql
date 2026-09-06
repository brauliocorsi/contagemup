CREATE OR REPLACE FUNCTION public.confirm_delivery_attempt(p_attempt_id uuid, p_lines jsonb, p_failure_reason text DEFAULT NULL, p_failure_notes text DEFAULT NULL, p_op_key text DEFAULT NULL, p_expected_version integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE uid uuid := auth.uid(); a RECORD; ln RECORD; v_qty integer; v_reason text;
        v_debited integer; v_mov uuid; res jsonb; total_del integer := 0; total_load integer := 0;
        v_outcome text; it RECORD; v_min integer; nt RECORD; v_all_done boolean; v_any boolean;
        v_fr text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  v_fr := NULLIF(trim(COALESCE(p_failure_reason,'')),'');
  IF p_op_key IS NOT NULL THEN
    SELECT result INTO res FROM public.delivery_operations WHERE op_key = p_op_key;
    IF res IS NOT NULL THEN RETURN res; END IF;
  END IF;

  SELECT * INTO a FROM public.delivery_attempts WHERE id = p_attempt_id FOR UPDATE;
  IF a IS NULL THEN RAISE EXCEPTION 'Tentativa não encontrada'; END IF;
  IF NOT public.is_delivery_manager(uid) AND NOT public.driver_sees_attempt(uid, a.route_id, a.driver_id) THEN
    RAISE EXCEPTION 'Entrega não atribuída a este utilizador';
  END IF;
  IF a.status IN ('completed','cancelled') THEN
    RAISE EXCEPTION 'Esta tentativa já foi fechada (%).', a.status;
  END IF;
  IF p_expected_version IS NOT NULL AND p_expected_version <> a.version THEN
    RAISE EXCEPTION 'A entrega foi alterada noutro dispositivo. Atualize antes de confirmar.';
  END IF;

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
             THEN COALESCE(v_reason, v_fr) ELSE NULL END
     WHERE id = ln.id;
    total_del := total_del + v_qty;
  END LOOP;

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

  IF v_outcome <> 'delivered_full' AND v_fr IS NULL THEN
    RAISE EXCEPTION 'Indique o motivo do que não foi entregue.';
  END IF;

  UPDATE public.delivery_attempts
     SET status = 'completed', outcome = v_outcome, completed_at = now(), completed_by = uid,
         failure_reason = v_fr,
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
         cancellation_requested = COALESCE(cancellation_requested,false) OR (COALESCE(v_fr,'') = 'pedido_cancelamento'),
         cancellation_reason = CASE WHEN COALESCE(v_fr,'') = 'pedido_cancelamento'
            THEN COALESCE(NULLIF(trim(COALESCE(p_failure_notes,'')),''), 'Pedido do cliente') ELSE cancellation_reason END,
         reschedule_requested = COALESCE(reschedule_requested,false) OR (COALESCE(v_fr,'') = 'reagendamento'),
         version = version + 1
   WHERE id = a.note_id;

  INSERT INTO public.delivery_events (note_id, attempt_id, event_type, payload, actor)
  VALUES (a.note_id, a.id, 'entrega_confirmada',
    jsonb_build_object('outcome', v_outcome, 'delivered', total_del, 'loaded', total_load,
      'reason', v_fr, 'notes', p_failure_notes), uid);

  res := jsonb_build_object('outcome', v_outcome, 'delivered', total_del, 'loaded', total_load,
    'return_expected', total_load - total_del, 'order_number', a.order_number);
  IF p_op_key IS NOT NULL THEN
    INSERT INTO public.delivery_operations (op_key, kind, attempt_id, actor, result)
    VALUES (p_op_key, 'confirm', p_attempt_id, uid, res) ON CONFLICT (op_key) DO NOTHING;
  END IF;
  RETURN res;
END $fn$;
REVOKE ALL ON FUNCTION public.confirm_delivery_attempt(uuid,jsonb,text,text,text,integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.confirm_delivery_attempt(uuid,jsonb,text,text,text,integer) TO authenticated;