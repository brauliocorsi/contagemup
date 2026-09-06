-- permitir criar tentativas sem entregador individual (a rota é a fonte da atribuição)
CREATE OR REPLACE FUNCTION public.assign_delivery_attempts(p_note_ids uuid[], p_driver uuid, p_scheduled_date date DEFAULT NULL::date, p_op_key text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
END $function$;

-- preparar entregas de uma rota inteira numa só ação
CREATE OR REPLACE FUNCTION public.assign_route_delivery(
  p_route_id uuid, p_driver uuid, p_reason text DEFAULT NULL, p_op_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); r RECORD; res jsonb; assign_res jsonb;
        v_notes uuid[]; v_created integer := 0;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF NOT public.is_delivery_manager(uid) THEN RAISE EXCEPTION 'Sem permissão para atribuir entregas'; END IF;
  IF p_op_key IS NOT NULL THEN
    SELECT result INTO res FROM public.delivery_operations WHERE op_key = p_op_key;
    IF res IS NOT NULL THEN RETURN res; END IF;
  END IF;

  SELECT * INTO r FROM public.route_schedules WHERE id = p_route_id;
  IF r IS NULL THEN RAISE EXCEPTION 'Rota não encontrada'; END IF;

  PERFORM public.assign_route_driver(p_route_id, p_driver, p_reason, NULL);

  SELECT array_agg(n.id) INTO v_notes
    FROM public.delivery_notes n
   WHERE n.route_id = p_route_id
     AND n.status <> 'cancelled'
     AND NOT EXISTS (SELECT 1 FROM public.delivery_attempts a
                      WHERE a.note_id = n.id AND a.status IN ('assigned','in_transit'));

  IF v_notes IS NOT NULL AND array_length(v_notes,1) > 0 THEN
    -- driver NULL: o acesso vem da rota, não de uma atribuição individual
    assign_res := public.assign_delivery_attempts(v_notes, NULL, r.scheduled_date, NULL);
    v_created := COALESCE((assign_res->>'created')::int, 0);
  END IF;

  res := jsonb_build_object('route_id', p_route_id, 'driver', p_driver, 'attempts_created', v_created);
  IF p_op_key IS NOT NULL THEN
    INSERT INTO public.delivery_operations (op_key, kind, actor, result)
    VALUES (p_op_key, 'assign_route_delivery', uid, res) ON CONFLICT (op_key) DO NOTHING;
  END IF;
  RETURN res;
END $$;

REVOKE ALL ON FUNCTION public.assign_route_delivery(uuid, uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.assign_route_delivery(uuid, uuid, text, text) TO authenticated;