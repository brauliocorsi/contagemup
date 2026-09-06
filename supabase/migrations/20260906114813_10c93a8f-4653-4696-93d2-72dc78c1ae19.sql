REVOKE EXECUTE ON FUNCTION public.apply_count_delta(uuid, integer, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_count_quantity(uuid, integer, integer, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.deliver_location_audit(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.complete_location_audit(uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.resolve_damage(uuid, text, text, text, text, boolean) FROM PUBLIC, anon;