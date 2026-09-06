REVOKE ALL ON FUNCTION public.driver_sees_attempt(uuid, uuid, uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.can_execute_attempt(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.driver_sees_attempt(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_execute_attempt(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.assign_route_driver(uuid, uuid, text, text) FROM anon;