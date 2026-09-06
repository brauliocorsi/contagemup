CREATE OR REPLACE FUNCTION public.ensure_route_notes_from_stops(p_route_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE s RECORD; v_created integer := 0;
BEGIN
  PERFORM set_config('app.allow_closed_route_change', 'on', true);
  FOR s IN
    SELECT * FROM public.route_stops
     WHERE route_id = p_route_id
       AND COALESCE(venda_codigo, '') <> ''
       AND status <> 'cancelled'
     ORDER BY order_number
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.delivery_notes n
       WHERE n.order_number = s.venda_codigo
         AND n.status <> 'cancelled'
    ) THEN
      INSERT INTO public.delivery_notes (order_number, client_name, address, status, route_id, notes)
      VALUES (s.venda_codigo, s.client_name, s.address, 'staged', p_route_id, s.notes);
      v_created := v_created + 1;
    ELSE
      UPDATE public.delivery_notes n
         SET route_id = p_route_id, updated_at = now()
       WHERE n.order_number = s.venda_codigo
         AND n.status NOT IN ('cancelled','delivered','returned')
         AND n.route_id IS DISTINCT FROM p_route_id;
    END IF;
  END LOOP;
  PERFORM set_config('app.allow_closed_route_change', '', true);
  RETURN v_created;
END $function$;

REVOKE ALL ON FUNCTION public.ensure_route_notes_from_stops(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_route_notes_from_stops(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.assign_route_delivery(p_route_id uuid, p_driver uuid, p_reason text DEFAULT NULL::text, p_op_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE uid uuid := auth.uid(); r RECORD; res jsonb; assign_res jsonb;
        v_notes uuid[]; v_created integer := 0; v_notes_created integer := 0;
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

  IF p_driver IS NOT NULL THEN
    v_notes_created := public.ensure_route_notes_from_stops(p_route_id);
  END IF;

  SELECT array_agg(n.id) INTO v_notes
    FROM public.delivery_notes n
   WHERE n.route_id = p_route_id
     AND n.status <> 'cancelled'
     AND NOT EXISTS (SELECT 1 FROM public.delivery_attempts a
                      WHERE a.note_id = n.id AND a.status IN ('assigned','in_transit'));

  IF v_notes IS NOT NULL AND array_length(v_notes,1) > 0 THEN
    PERFORM set_config('app.allow_closed_route_change', 'on', true);
    assign_res := public.assign_delivery_attempts(v_notes, NULL, r.scheduled_date, NULL);
    PERFORM set_config('app.allow_closed_route_change', '', true);
    v_created := COALESCE((assign_res->>'created')::int, 0);
  END IF;

  res := jsonb_build_object('route_id', p_route_id, 'driver', p_driver,
                            'notes_created', v_notes_created, 'attempts_created', v_created);
  IF p_op_key IS NOT NULL THEN
    INSERT INTO public.delivery_operations (op_key, kind, actor, result)
    VALUES (p_op_key, 'assign_route_delivery', uid, res) ON CONFLICT (op_key) DO NOTHING;
  END IF;
  RETURN res;
END $function$;

-- Backfill: rotas ativas com entregador e sem entregas preparadas
DO $do$
DECLARE r RECORD; n RECORD; v_att uuid; it RECORD; coli integer; v_total integer;
BEGIN
  PERFORM set_config('app.allow_closed_route_change', 'on', true);
  FOR r IN SELECT * FROM public.route_schedules
            WHERE driver_id IS NOT NULL AND status IN ('pending','in_progress') LOOP
    PERFORM public.ensure_route_notes_from_stops(r.id);
    FOR n IN SELECT * FROM public.delivery_notes
              WHERE route_id = r.id AND status <> 'cancelled'
                AND NOT EXISTS (SELECT 1 FROM public.delivery_attempts a
                                 WHERE a.note_id = delivery_notes.id
                                   AND a.status IN ('assigned','in_transit')) LOOP
      INSERT INTO public.delivery_attempts (
        note_id, route_id, attempt_number, driver_id, scheduled_date, vehicle_location,
        order_number, client_name, address, delivery_instructions, partial_load, assigned_by)
      SELECT n.id, r.id, COALESCE(MAX(a.attempt_number),0) + 1, NULL, r.scheduled_date,
             n.vehicle_location, n.order_number, n.client_name, n.address,
             n.delivery_instructions, false, r.driver_assigned_by
        FROM public.delivery_attempts a WHERE a.note_id = n.id
      RETURNING id INTO v_att;

      FOR it IN SELECT * FROM public.delivery_note_items WHERE note_id = n.id LOOP
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
      VALUES (n.id, v_att, 'tentativa_atribuida',
        jsonb_build_object('driver', r.driver_id, 'date', r.scheduled_date, 'backfill', true), r.driver_assigned_by);
    END LOOP;
  END LOOP;
  PERFORM set_config('app.allow_closed_route_change', '', true);
END $do$;