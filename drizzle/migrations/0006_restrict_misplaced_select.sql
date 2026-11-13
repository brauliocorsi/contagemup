DROP POLICY IF EXISTS "Ver alertas de local errado" ON public.location_audit_misplaced;
CREATE POLICY "Ver alertas de local errado" ON public.location_audit_misplaced
FOR SELECT TO authenticated
USING (
  NOT public.is_driver_only(auth.uid())
  AND EXISTS (SELECT 1 FROM public.location_audits a WHERE a.id = audit_id)
);