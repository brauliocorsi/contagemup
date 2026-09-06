CREATE OR REPLACE FUNCTION public.is_delivery_manager(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = _uid AND role IN ('master','admin','operator'));
$$;

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
    -- preparar entregas não altera a composição da rota: permitido mesmo com preparação fechada
    PERFORM set_config('app.allow_closed_route_change', 'on', true);
    assign_res := public.assign_delivery_attempts(v_notes, NULL, r.scheduled_date, NULL);
    PERFORM set_config('app.allow_closed_route_change', '', true);
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