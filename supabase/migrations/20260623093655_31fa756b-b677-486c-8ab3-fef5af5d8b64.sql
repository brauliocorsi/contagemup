
-- 1) Prevent profile role escalation via direct UPDATE
CREATE OR REPLACE FUNCTION public.prevent_profile_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Role changes are not permitted via direct profile updates';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_profile_role_change_trigger ON public.profiles;
CREATE TRIGGER prevent_profile_role_change_trigger
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_role_change();

-- 2) Restrict route_stops to the creator of the parent route
DROP POLICY IF EXISTS "Authenticated users can view route stops" ON public.route_stops;
DROP POLICY IF EXISTS "Authenticated users can update route stops" ON public.route_stops;
DROP POLICY IF EXISTS "Authenticated users can delete route stops" ON public.route_stops;
DROP POLICY IF EXISTS "Authenticated users can create route stops" ON public.route_stops;

CREATE POLICY "Route owners can view route stops"
ON public.route_stops FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.route_schedules rs
    WHERE rs.id = route_stops.route_id
      AND rs.created_by = auth.uid()
  )
);

CREATE POLICY "Route owners can insert route stops"
ON public.route_stops FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.route_schedules rs
    WHERE rs.id = route_stops.route_id
      AND rs.created_by = auth.uid()
  )
);

CREATE POLICY "Route owners can update route stops"
ON public.route_stops FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.route_schedules rs
    WHERE rs.id = route_stops.route_id
      AND rs.created_by = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.route_schedules rs
    WHERE rs.id = route_stops.route_id
      AND rs.created_by = auth.uid()
  )
);

CREATE POLICY "Route owners can delete route stops"
ON public.route_stops FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.route_schedules rs
    WHERE rs.id = route_stops.route_id
      AND rs.created_by = auth.uid()
  )
);
