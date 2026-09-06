CREATE OR REPLACE FUNCTION public.submit_route_accounting(p_route_id uuid, p_cash_cents bigint, p_no_cash boolean, p_notes text, p_op_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid(); v_closure uuid; v_env text; v_totals jsonb;
  v_declared bigint; v_expected bigint; v_cash bigint; v_exc jsonb; v_prev record; v_m record;
BEGIN
  IF coalesce(trim(p_op_key),'') = '' THEN RAISE EXCEPTION 'Chave de operação em falta'; END IF;
  SELECT * INTO v_prev FROM public.route_cash_closures WHERE op_key = p_op_key;
  IF FOUND THEN
    RETURN jsonb_build_object('closure_id', v_prev.id, 'envelope_code', v_prev.envelope_code,
                              'idempotent', true);
  END IF;

  IF EXISTS (SELECT 1 FROM public.route_cash_closures
              WHERE route_id = p_route_id AND driver_id = v_uid) THEN
    RAISE EXCEPTION 'Já fechou a prestação de contas desta rota';
  END IF;

  IF NOT public.is_delivery_manager(v_uid)
     AND NOT EXISTS (SELECT 1 FROM public.route_schedules r
                     WHERE r.id = p_route_id AND r.driver_id = v_uid) THEN
    RAISE EXCEPTION 'Sem autorização para fechar contas desta rota';
  END IF;

  SELECT COALESCE(jsonb_object_agg(t.method_id, t.total), '{}'::jsonb),
         COALESCE(sum(t.total), 0)
    INTO v_totals, v_declared
    FROM (SELECT method_id, sum(amount_cents) AS total
            FROM public.delivery_payments
           WHERE route_id = p_route_id AND declared_by = v_uid
           GROUP BY method_id) t;

  SELECT COALESCE(sum((public.attempt_amount_due(a.id)->>'due_cents')::bigint), 0)
    INTO v_expected
    FROM public.delivery_attempts a
   WHERE a.route_id = p_route_id AND a.driver_id IS NOT DISTINCT FROM v_uid;

  SELECT COALESCE(sum(p.amount_cents), 0) INTO v_cash
    FROM public.delivery_payments p
    JOIN public.payment_methods pm ON pm.id = p.method_id
   WHERE p.route_id = p_route_id AND p.declared_by = v_uid AND pm.kind = 'cash';

  IF NOT p_no_cash AND p_cash_cents <> v_cash THEN
    RAISE EXCEPTION 'O numerário do envelope (% cent) não corresponde ao declarado nas entregas (% cent)',
      p_cash_cents, v_cash;
  END IF;
  IF p_no_cash AND v_cash > 0 THEN
    RAISE EXCEPTION 'Declarou numerário em entregas desta rota; não pode marcar "sem numerário"';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'attempt_id', a.id, 'order_number', a.order_number, 'status', a.status)), '[]'::jsonb)
    INTO v_exc
    FROM public.delivery_attempts a
   WHERE a.route_id = p_route_id AND a.status IN ('assigned','in_transit');

  v_env := 'ENV-' || to_char(now(),'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));

  INSERT INTO public.route_cash_closures
    (route_id, driver_id, envelope_code, cash_declared_cents, no_cash, totals,
     expected_cents, declared_cents, exceptions, notes, submitted_by, op_key)
  VALUES (p_route_id, v_uid, v_env, CASE WHEN p_no_cash THEN 0 ELSE p_cash_cents END,
          p_no_cash, v_totals, v_expected, v_declared, v_exc, NULLIF(p_notes,''), v_uid, p_op_key)
  RETURNING id INTO v_closure;

  UPDATE public.delivery_payments
     SET locked = true, closure_id = v_closure
   WHERE route_id = p_route_id AND declared_by = v_uid;

  FOR v_m IN SELECT pm.id, pm.kind, sum(p.amount_cents) AS total
             FROM public.delivery_payments p
             JOIN public.payment_methods pm ON pm.id = p.method_id
            WHERE p.closure_id = v_closure
            GROUP BY pm.id, pm.kind LOOP
    INSERT INTO public.route_closure_method_checks (closure_id, method_id, declared_cents)
    VALUES (v_closure, v_m.id, v_m.total);
  END LOOP;

  UPDATE public.route_schedules SET financial_status = 'submitted' WHERE id = p_route_id;

  INSERT INTO public.delivery_events (note_id, attempt_id, event_type, payload, actor)
  VALUES (NULL, NULL, 'prestacao_contas_submetida',
          jsonb_build_object('route_id', p_route_id, 'closure_id', v_closure,
                             'envelope_code', v_env, 'cash_cents', v_cash,
                             'declared_cents', v_declared), v_uid);

  RETURN jsonb_build_object('closure_id', v_closure, 'envelope_code', v_env,
                            'cash_cents', CASE WHEN p_no_cash THEN 0 ELSE p_cash_cents END,
                            'declared_cents', v_declared, 'expected_cents', v_expected);
END; $function$;

REVOKE ALL ON FUNCTION public.submit_route_accounting(uuid, bigint, boolean, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_route_accounting(uuid, bigint, boolean, text, text) TO authenticated;