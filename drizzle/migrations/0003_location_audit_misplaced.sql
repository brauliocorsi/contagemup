CREATE TABLE public.location_audit_misplaced (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES public.location_audits(id) ON DELETE CASCADE,
  product_id uuid,
  product_code text NOT NULL,
  product_name text,
  colis_number integer,
  scanned_location text NOT NULL,
  system_locations text[] NOT NULL DEFAULT '{}',
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.location_audit_misplaced IS 'Alertas de produto lido fora da sua localização numa conferência. Não ajusta stock.';
CREATE INDEX ON public.location_audit_misplaced(audit_id);
GRANT SELECT, INSERT ON public.location_audit_misplaced TO authenticated;
GRANT ALL ON public.location_audit_misplaced TO service_role;
ALTER TABLE public.location_audit_misplaced ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ver alertas de local errado" ON public.location_audit_misplaced FOR SELECT TO authenticated USING (true);
CREATE POLICY "Registar alertas de local errado" ON public.location_audit_misplaced FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());