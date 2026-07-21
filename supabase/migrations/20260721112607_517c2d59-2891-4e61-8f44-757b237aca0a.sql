
-- 1. Enable RLS on archive + admin-only SELECT
ALTER TABLE public.stock_movements_archive ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view stock movements archive"
ON public.stock_movements_archive
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.stock_movements_archive TO authenticated;
GRANT ALL ON public.stock_movements_archive TO service_role;

-- 2. Revoke EXECUTE from anon on all SECURITY DEFINER functions.
-- Trigger functions and RPCs should never be callable anonymously.
REVOKE EXECUTE ON FUNCTION public.admin_reset_stock_data() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.decrement_counts_for_picking(uuid, integer, boolean, integer, jsonb, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.recalculate_all_stock() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.prevent_profile_role_change() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.sync_product_stock() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.sync_damaged_stock() FROM anon, public;

-- Ensure authenticated retains needed access (RPCs already scoped).
GRANT EXECUTE ON FUNCTION public.has_role(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_stock_data() TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_counts_for_picking(uuid, integer, boolean, integer, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_all_stock() TO authenticated;
