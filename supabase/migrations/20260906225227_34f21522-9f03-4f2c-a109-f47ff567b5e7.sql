REVOKE ALL ON FUNCTION public.enforce_route_preparation_lock() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_route_preparation_lock() TO service_role;
REVOKE ALL ON FUNCTION public.bump_route_composition() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump_route_composition() TO service_role;