-- ============================================================
-- FASE ENTREGAS: tentativas, execução pelo entregador e retornos
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_driver_only(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = _uid AND role = 'entregador')
     AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = _uid AND role IN ('admin','operator'));
$$;

CREATE OR REPLACE FUNCTION public.is_delivery_manager(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = _uid AND role IN ('admin','operator'));
$$;

ALTER TABLE public.delivery_notes
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS delivery_instructions text,
  ADD COLUMN IF NOT EXISTS cancellation_requested boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS reschedule_requested boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS public.delivery_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid NOT NULL REFERENCES public.delivery_notes(id) ON DELETE CASCADE,
  route_id uuid REFERENCES public.route_schedules(id) ON DELETE SET NULL,
  attempt_number integer NOT NULL,
  driver_id uuid,
  scheduled_date date,
  vehicle_location text,
  status text NOT NULL DEFAULT 'assigned',
  outcome text,
  failure_reason text,
  failure_notes text,
  order_number text NOT NULL,
  client_name text,
  address text,
  delivery_instructions text,
  partial_load boolean NOT NULL DEFAULT false,
  partial_load_reason text,
  assigned_by uuid,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  completed_by uuid,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (note_id, attempt_number)
);

CREATE TABLE IF NOT EXISTS public.delivery_attempt_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.delivery_attempts(id) ON DELETE CASCADE,
  note_item_id uuid REFERENCES public.delivery_note_items(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_code text NOT NULL DEFAULT '',
  product_name text NOT NULL DEFAULT '?',
  details text,
  colis_number integer NOT NULL DEFAULT 1,
  ordered_quantity integer NOT NULL DEFAULT 0,
  loaded_quantity integer NOT NULL DEFAULT 0,
  delivered_quantity integer NOT NULL DEFAULT 0,
  undelivered_reason text,
  return_received_ok integer NOT NULL DEFAULT 0,
  return_received_damaged integer NOT NULL DEFAULT 0,
  return_location text,
  received_at timestamptz,
  received_by uuid,
  exception_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, note_item_id, colis_number)
);

CREATE INDEX IF NOT EXISTS idx_attempts_driver ON public.delivery_attempts(driver_id, status);
CREATE INDEX IF NOT EXISTS idx_attempts_note ON public.delivery_attempts(note_id);
CREATE INDEX IF NOT EXISTS idx_attempt_lines_attempt ON public.delivery_attempt_lines(attempt_id);

CREATE TABLE IF NOT EXISTS public.delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid REFERENCES public.delivery_notes(id) ON DELETE CASCADE,
  attempt_id uuid REFERENCES public.delivery_attempts(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_delivery_events_note ON public.delivery_events(note_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.delivery_operations (
  op_key text PRIMARY KEY,
  kind text NOT NULL,
  attempt_id uuid,
  actor uuid,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_attempts TO authenticated;
GRANT ALL ON public.delivery_attempts TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.delivery_attempt_lines TO authenticated;
GRANT ALL ON public.delivery_attempt_lines TO service_role;
GRANT SELECT ON public.delivery_events TO authenticated;
GRANT ALL ON public.delivery_events TO service_role;
GRANT SELECT ON public.delivery_operations TO authenticated;
GRANT ALL ON public.delivery_operations TO service_role;

ALTER TABLE public.delivery_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_attempt_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_operations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ver tentativas atribuidas ou geridas" ON public.delivery_attempts;
CREATE POLICY "Ver tentativas atribuidas ou geridas" ON public.delivery_attempts
FOR SELECT TO authenticated
USING (public.is_delivery_manager(auth.uid()) OR driver_id = auth.uid());

DROP POLICY IF EXISTS "Responsaveis criam tentativas" ON public.delivery_attempts;
CREATE POLICY "Responsaveis criam tentativas" ON public.delivery_attempts
FOR INSERT TO authenticated WITH CHECK (public.is_delivery_manager(auth.uid()));

DROP POLICY IF EXISTS "Responsaveis atualizam tentativas" ON public.delivery_attempts;
CREATE POLICY "Responsaveis atualizam tentativas" ON public.delivery_attempts
FOR UPDATE TO authenticated USING (public.is_delivery_manager(auth.uid()))
WITH CHECK (public.is_delivery_manager(auth.uid()));

DROP POLICY IF EXISTS "Admins eliminam tentativas" ON public.delivery_attempts;
CREATE POLICY "Admins eliminam tentativas" ON public.delivery_attempts
FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Ver linhas das tentativas visiveis" ON public.delivery_attempt_lines;
CREATE POLICY "Ver linhas das tentativas visiveis" ON public.delivery_attempt_lines
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.delivery_attempts a WHERE a.id = attempt_id
        AND (public.is_delivery_manager(auth.uid()) OR a.driver_id = auth.uid())));

DROP POLICY IF EXISTS "Responsaveis gerem linhas" ON public.delivery_attempt_lines;
CREATE POLICY "Responsaveis gerem linhas" ON public.delivery_attempt_lines
FOR UPDATE TO authenticated USING (public.is_delivery_manager(auth.uid()))
WITH CHECK (public.is_delivery_manager(auth.uid()));

DROP POLICY IF EXISTS "Responsaveis inserem linhas" ON public.delivery_attempt_lines;
CREATE POLICY "Responsaveis inserem linhas" ON public.delivery_attempt_lines
FOR INSERT TO authenticated WITH CHECK (public.is_delivery_manager(auth.uid()));

DROP POLICY IF EXISTS "Ver eventos das tentativas visiveis" ON public.delivery_events;
CREATE POLICY "Ver eventos das tentativas visiveis" ON public.delivery_events
FOR SELECT TO authenticated
USING (public.is_delivery_manager(auth.uid())
   OR EXISTS (SELECT 1 FROM public.delivery_attempts a WHERE a.id = attempt_id AND a.driver_id = auth.uid()));

DROP POLICY IF EXISTS "Ver operacoes proprias" ON public.delivery_operations;
CREATE POLICY "Ver operacoes proprias" ON public.delivery_operations
FOR SELECT TO authenticated USING (public.is_delivery_manager(auth.uid()) OR actor = auth.uid());

DO $iso$
DECLARE r record; using_txt text; check_txt text;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename NOT IN ('delivery_attempts','delivery_attempt_lines','delivery_events','delivery_operations','profiles')
      AND coalesce(qual,'') NOT LIKE '%is_driver_only%'
      AND coalesce(with_check,'') NOT LIKE '%is_driver_only%'
  LOOP
    using_txt := CASE WHEN r.qual IS NOT NULL
      THEN format(' USING ((%s) AND NOT public.is_driver_only(auth.uid()))', r.qual) ELSE '' END;
    check_txt := CASE WHEN r.with_check IS NOT NULL
      THEN format(' WITH CHECK ((%s) AND NOT public.is_driver_only(auth.uid()))', r.with_check) ELSE '' END;
    EXECUTE format('ALTER POLICY %I ON public.%I%s%s', r.policyname, r.tablename, using_txt, check_txt);
  END LOOP;
END $iso$;

DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;
CREATE POLICY "Authenticated users can view profiles" ON public.profiles
FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL AND (NOT public.is_driver_only(auth.uid()) OR user_id = auth.uid()));

DROP TRIGGER IF EXISTS trg_attempts_updated ON public.delivery_attempts;
CREATE TRIGGER trg_attempts_updated BEFORE UPDATE ON public.delivery_attempts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_attempt_lines_updated ON public.delivery_attempt_lines;
CREATE TRIGGER trg_attempt_lines_updated BEFORE UPDATE ON public.delivery_attempt_lines
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();