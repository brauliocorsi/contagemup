CREATE TABLE public.scanner_picking_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  reference text,
  source text NOT NULL DEFAULT 'separacao',
  notes text,
  status text NOT NULL DEFAULT 'pending',
  created_by uuid,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scanner_picking_tasks_status_check CHECK (status IN ('pending','in_progress','completed','cancelled'))
);

CREATE TABLE public.scanner_picking_task_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.scanner_picking_tasks(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_code text NOT NULL DEFAULT '',
  product_name text NOT NULL,
  details text,
  orders text,
  locations text,
  requested_quantity integer NOT NULL DEFAULT 0,
  picked_quantity integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_scanner_picking_task_items_task ON public.scanner_picking_task_items(task_id);
CREATE INDEX idx_scanner_picking_tasks_status ON public.scanner_picking_tasks(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scanner_picking_tasks TO authenticated;
GRANT ALL ON public.scanner_picking_tasks TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scanner_picking_task_items TO authenticated;
GRANT ALL ON public.scanner_picking_task_items TO service_role;

ALTER TABLE public.scanner_picking_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scanner_picking_task_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view picking tasks" ON public.scanner_picking_tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create picking tasks" ON public.scanner_picking_tasks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update picking tasks" ON public.scanner_picking_tasks FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins can delete picking tasks" ON public.scanner_picking_tasks FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can view picking task items" ON public.scanner_picking_task_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create picking task items" ON public.scanner_picking_task_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update picking task items" ON public.scanner_picking_task_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins can delete picking task items" ON public.scanner_picking_task_items FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_scanner_picking_tasks_updated_at BEFORE UPDATE ON public.scanner_picking_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_scanner_picking_task_items_updated_at BEFORE UPDATE ON public.scanner_picking_task_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();