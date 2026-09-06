CREATE OR REPLACE FUNCTION public.driver_sees_attempt(_uid uuid, _route_id uuid, _attempt_driver uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _uid IS NULL THEN false
    -- a rota é a fonte da atribuição: sem entregador na rota, ninguém herda acesso
    WHEN _route_id IS NOT NULL THEN EXISTS (
      SELECT 1 FROM public.route_schedules r WHERE r.id = _route_id AND r.driver_id = _uid
    )
    -- entregas fora de rota mantêm a atribuição individual
    ELSE _attempt_driver = _uid
  END;
$$;
REVOKE ALL ON FUNCTION public.driver_sees_attempt(uuid,uuid,uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.driver_sees_attempt(uuid,uuid,uuid) TO authenticated;