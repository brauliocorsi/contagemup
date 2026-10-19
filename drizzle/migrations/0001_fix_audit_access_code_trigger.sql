ALTER FUNCTION public.set_audit_access_code() SECURITY DEFINER;
REVOKE EXECUTE ON FUNCTION public.set_audit_access_code() FROM PUBLIC, anon;