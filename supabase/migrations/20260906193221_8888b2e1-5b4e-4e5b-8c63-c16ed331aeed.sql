-- 1) Entregador na instância concreta de rota
ALTER TABLE public.route_schedules
  ADD COLUMN IF NOT EXISTS driver_id uuid,
  ADD COLUMN IF NOT EXISTS driver_assigned_by uuid,
  ADD COLUMN IF NOT EXISTS driver_assigned_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_route_schedules_driver ON public.route_schedules(driver_id);
CREATE INDEX IF NOT EXISTS idx_delivery_attempts_route ON public.delivery_attempts(route_id);

-- 2) Regra de acesso: a rota é a fonte da atribuição; atribuição individual só como exceção herdada
CREATE OR REPLACE FUNCTION public.driver_sees_attempt(_uid uuid, _route_id uuid, _attempt_driver uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN _uid IS NULL THEN false
    WHEN _route_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.route_schedules r WHERE r.id = _route_id AND r.driver_id IS NOT NULL
    ) THEN EXISTS (
      SELECT 1 FROM public.route_schedules r WHERE r.id = _route_id AND r.driver_id = _uid
    )
    ELSE _attempt_driver = _uid
  END;
$$;

CREATE OR REPLACE FUNCTION public.can_execute_attempt(_attempt_id uuid, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.delivery_attempts a
     WHERE a.id = _attempt_id
       AND (public.is_delivery_manager(_uid)
            OR public.driver_sees_attempt(_uid, a.route_id, a.driver_id))
  );
$$;

-- 3) RLS baseada na rota
DROP POLICY IF EXISTS "Ver tentativas atribuidas ou geridas" ON public.delivery_attempts;
CREATE POLICY "Ver tentativas atribuidas ou geridas" ON public.delivery_attempts
  FOR SELECT TO authenticated
  USING (public.is_delivery_manager(auth.uid())
         OR public.driver_sees_attempt(auth.uid(), route_id, driver_id));

DROP POLICY IF EXISTS "Ver linhas das tentativas visiveis" ON public.delivery_attempt_lines;
CREATE POLICY "Ver linhas das tentativas visiveis" ON public.delivery_attempt_lines
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.delivery_attempts a
                  WHERE a.id = delivery_attempt_lines.attempt_id
                    AND (public.is_delivery_manager(auth.uid())
                         OR public.driver_sees_attempt(auth.uid(), a.route_id, a.driver_id))));

DROP POLICY IF EXISTS "Ver eventos das tentativas visiveis" ON public.delivery_events;
CREATE POLICY "Ver eventos das tentativas visiveis" ON public.delivery_events
  FOR SELECT TO authenticated
  USING (public.is_delivery_manager(auth.uid())
         OR EXISTS (SELECT 1 FROM public.delivery_attempts a
                     WHERE a.id = delivery_events.attempt_id
                       AND public.driver_sees_attempt(auth.uid(), a.route_id, a.driver_id)));

-- entregador vê apenas as suas rotas
DROP POLICY IF EXISTS "Authenticated users can view routes" ON public.route_schedules;
CREATE POLICY "Authenticated users can view routes" ON public.route_schedules
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL
         AND (NOT public.is_driver_only(auth.uid()) OR driver_id = auth.uid()));

-- entregador não altera rotas (mantém-se bloqueado por is_driver_only nas restantes policies)

-- 4) Atribuir / trocar entregador da rota
CREATE OR REPLACE FUNCTION public.assign_route_driver(
  p_route_id uuid, p_driver uuid, p_reason text DEFAULT NULL, p_op_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); r RECORD; res jsonb; v_prev uuid;
        v_pending integer := 0; v_in_transit integer := 0; a RECORD;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF NOT public.is_delivery_manager(uid) THEN RAISE EXCEPTION 'Sem permissão para atribuir entregas'; END IF;
  IF p_op_key IS NOT NULL THEN
    SELECT result INTO res FROM public.delivery_operations WHERE op_key = p_op_key;
    IF res IS NOT NULL THEN RETURN res; END IF;
  END IF;

  SELECT * INTO r FROM public.route_schedules WHERE id = p_route_id FOR UPDATE;
  IF r IS NULL THEN RAISE EXCEPTION 'Rota não encontrada'; END IF;
  v_prev := r.driver_id;

  SELECT count(*) FILTER (WHERE status IN ('assigned','in_transit')),
         count(*) FILTER (WHERE status = 'in_transit')
    INTO v_pending, v_in_transit
    FROM public.delivery_attempts WHERE route_id = p_route_id;

  IF v_prev IS DISTINCT FROM p_driver AND v_in_transit > 0
     AND NULLIF(trim(COALESCE(p_reason,'')),'') IS NULL THEN
    RAISE EXCEPTION 'A rota já está em execução: indique o motivo da troca de entregador.';
  END IF;

  UPDATE public.route_schedules
     SET driver_id = p_driver,
         driver_assigned_by = uid,
         driver_assigned_at = now(),
         updated_at = now()
   WHERE id = p_route_id;

  -- histórico por entrega pendente (autoria de eventos passados nunca é reescrita)
  FOR a IN SELECT * FROM public.delivery_attempts
            WHERE route_id = p_route_id AND status IN ('assigned','in_transit') LOOP
    INSERT INTO public.delivery_events (note_id, attempt_id, event_type, payload, actor)
    VALUES (a.note_id, a.id,
      CASE WHEN v_prev IS NULL THEN 'rota_entregador_atribuido' ELSE 'rota_entregador_alterado' END,
      jsonb_build_object('route_id', p_route_id, 'previous_driver', v_prev,
                         'driver', p_driver, 'reason', p_reason, 'attempt_status', a.status), uid);
  END LOOP;

  res := jsonb_build_object('route_id', p_route_id, 'driver', p_driver,
                            'previous_driver', v_prev, 'pending', v_pending,
                            'in_transit', v_in_transit);
  IF p_op_key IS NOT NULL THEN
    INSERT INTO public.delivery_operations (op_key, kind, actor, result)
    VALUES (p_op_key, 'assign_route_driver', uid, res) ON CONFLICT (op_key) DO NOTHING;
  END IF;
  RETURN res;
END $$;

REVOKE ALL ON FUNCTION public.assign_route_driver(uuid, uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.assign_route_driver(uuid, uuid, text, text) TO authenticated;

-- 5) Conflitos herdados: atribuições individuais que não coincidem com a rota
CREATE OR REPLACE VIEW public.delivery_assignment_conflicts
WITH (security_invoker = true) AS
SELECT a.id AS attempt_id, a.note_id, a.order_number, a.client_name, a.status,
       a.scheduled_date, a.driver_id AS legacy_driver_id,
       a.route_id, r.name AS route_name, r.driver_id AS route_driver_id,
       CASE WHEN a.route_id IS NULL THEN 'sem_rota'
            WHEN r.driver_id IS NULL THEN 'rota_sem_entregador'
            ELSE 'entregador_diferente' END AS conflict_type
  FROM public.delivery_attempts a
  LEFT JOIN public.route_schedules r ON r.id = a.route_id
 WHERE a.status IN ('assigned','in_transit')
   AND a.driver_id IS NOT NULL
   AND (a.route_id IS NULL OR r.driver_id IS NULL OR r.driver_id <> a.driver_id);

GRANT SELECT ON public.delivery_assignment_conflicts TO authenticated;

-- 6) Iniciar/confirmar passam a validar o acesso pela rota (resto das funções intacto)
DO $mig$
DECLARE d text;
BEGIN
  FOR d IN SELECT pg_get_functiondef(p.oid) FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public'
             AND p.proname IN ('start_delivery_attempt','confirm_delivery_attempt') LOOP
    d := replace(d,
      'IF a.driver_id <> uid AND NOT public.is_delivery_manager(uid) THEN',
      'IF NOT public.is_delivery_manager(uid) AND NOT public.driver_sees_attempt(uid, a.route_id, a.driver_id) THEN');
    EXECUTE d;
  END LOOP;
END $mig$;
