REVOKE EXECUTE ON FUNCTION public.is_driver_only(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_delivery_manager(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.debit_counts_at(uuid, integer, integer, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.assign_delivery_attempts(uuid[], uuid, date, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.start_delivery_attempt(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.confirm_delivery_attempt(uuid, jsonb, text, text, text, integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.receive_delivery_return(uuid, jsonb, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.reschedule_delivery_note(uuid, date, uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.cancel_delivery_note(uuid, text, text) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.is_driver_only(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_delivery_manager(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.debit_counts_at(uuid, integer, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.assign_delivery_attempts(uuid[], uuid, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.start_delivery_attempt(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_delivery_attempt(uuid, jsonb, text, text, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.receive_delivery_return(uuid, jsonb, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reschedule_delivery_note(uuid, date, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_delivery_note(uuid, text, text) TO authenticated, service_role;