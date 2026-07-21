
-- 1) has_role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id AND role = _role
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, text) TO authenticated, service_role;

-- 2) Replace DELETE policies (admin-only)
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'products','counts','count_logs','stock_movements','counting_sessions',
    'reconciliations','reconciliation_items','picking_items','picking_sessions',
    'location_audit_items','categories'
  ];
  pol record;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t AND cmd = 'DELETE'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;
    EXECUTE format(
      'CREATE POLICY "Admins can delete %1$s" ON public.%1$I FOR DELETE TO authenticated USING (public.has_role(auth.uid(), ''admin''))',
      t
    );
  END LOOP;
END$$;

-- 3) admin_reset_stock_data
CREATE OR REPLACE FUNCTION public.admin_reset_stock_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_picking_items int;
  c_count_logs int;
  c_reconciliation_items int;
  c_location_audit_items int;
  c_counts int;
  c_stock_movements int;
  c_picking_sessions int;
  c_reconciliations int;
  c_location_audits int;
  c_counting_sessions int;
  c_product_damages int;
  c_product_changes int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'insufficient_privilege: apenas administradores podem executar esta operação'
      USING ERRCODE = '42501';
  END IF;

  WITH d AS (DELETE FROM public.picking_items         RETURNING 1) SELECT count(*) INTO c_picking_items FROM d;
  WITH d AS (DELETE FROM public.count_logs            RETURNING 1) SELECT count(*) INTO c_count_logs FROM d;
  WITH d AS (DELETE FROM public.reconciliation_items  RETURNING 1) SELECT count(*) INTO c_reconciliation_items FROM d;
  WITH d AS (DELETE FROM public.location_audit_items  RETURNING 1) SELECT count(*) INTO c_location_audit_items FROM d;

  WITH d AS (DELETE FROM public.product_damages       RETURNING 1) SELECT count(*) INTO c_product_damages FROM d;
  WITH d AS (DELETE FROM public.product_changes       RETURNING 1) SELECT count(*) INTO c_product_changes FROM d;

  WITH d AS (DELETE FROM public.counts                RETURNING 1) SELECT count(*) INTO c_counts FROM d;
  WITH d AS (DELETE FROM public.stock_movements       RETURNING 1) SELECT count(*) INTO c_stock_movements FROM d;

  WITH d AS (DELETE FROM public.picking_sessions      RETURNING 1) SELECT count(*) INTO c_picking_sessions FROM d;
  WITH d AS (DELETE FROM public.reconciliations       RETURNING 1) SELECT count(*) INTO c_reconciliations FROM d;
  WITH d AS (DELETE FROM public.location_audits       RETURNING 1) SELECT count(*) INTO c_location_audits FROM d;
  WITH d AS (DELETE FROM public.counting_sessions     RETURNING 1) SELECT count(*) INTO c_counting_sessions FROM d;

  RETURN jsonb_build_object(
    'picking_items', c_picking_items,
    'count_logs', c_count_logs,
    'reconciliation_items', c_reconciliation_items,
    'location_audit_items', c_location_audit_items,
    'product_damages', c_product_damages,
    'product_changes', c_product_changes,
    'counts', c_counts,
    'stock_movements', c_stock_movements,
    'picking_sessions', c_picking_sessions,
    'reconciliations', c_reconciliations,
    'location_audits', c_location_audits,
    'counting_sessions', c_counting_sessions
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reset_stock_data() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reset_stock_data() TO authenticated;
