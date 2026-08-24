CREATE TABLE public.week_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL DEFAULT '',
  name text NOT NULL DEFAULT '',
  date_from text NOT NULL DEFAULT '',
  date_to text NOT NULL DEFAULT '',
  plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.week_plans TO authenticated;
GRANT ALL ON public.week_plans TO service_role;
ALTER TABLE public.week_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "week_plans select" ON public.week_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "week_plans insert" ON public.week_plans FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "week_plans update" ON public.week_plans FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "week_plans delete" ON public.week_plans FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_week_plans_updated_at
BEFORE UPDATE ON public.week_plans
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.transport_guides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL,
  order_code text NOT NULL DEFAULT '',
  client_name text NOT NULL DEFAULT '',
  guide_id bigint,
  guide_number text NOT NULL DEFAULT '',
  permalink text NOT NULL DEFAULT '',
  plate text NOT NULL DEFAULT '',
  address_from text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1,
  batch_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX transport_guides_order_id_idx ON public.transport_guides (order_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transport_guides TO authenticated;
GRANT ALL ON public.transport_guides TO service_role;
ALTER TABLE public.transport_guides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transport_guides select" ON public.transport_guides FOR SELECT TO authenticated USING (true);
CREATE POLICY "transport_guides insert" ON public.transport_guides FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "transport_guides update" ON public.transport_guides FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "transport_guides delete" ON public.transport_guides FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_transport_guides_updated_at
BEFORE UPDATE ON public.transport_guides
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();