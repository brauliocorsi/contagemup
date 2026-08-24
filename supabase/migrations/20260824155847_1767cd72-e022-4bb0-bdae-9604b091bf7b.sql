ALTER TABLE public.scanner_picking_task_items
  ADD COLUMN IF NOT EXISTS picked_by uuid,
  ADD COLUMN IF NOT EXISTS picked_at timestamptz;

ALTER TABLE public.scanner_picking_tasks
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

ALTER TABLE public.location_audits
  ADD COLUMN IF NOT EXISTS assigned_to uuid;

CREATE INDEX IF NOT EXISTS idx_location_audits_assigned_to ON public.location_audits(assigned_to);

ALTER TABLE public.scanner_picking_task_items
  DROP CONSTRAINT IF EXISTS scanner_picking_task_items_task_id_fkey;
ALTER TABLE public.scanner_picking_task_items
  ADD CONSTRAINT scanner_picking_task_items_task_id_fkey
  FOREIGN KEY (task_id) REFERENCES public.scanner_picking_tasks(id) ON DELETE CASCADE;

DROP POLICY IF EXISTS "Authenticated can delete scanner picking tasks" ON public.scanner_picking_tasks;
DROP POLICY IF EXISTS "Admins can delete scanner picking tasks" ON public.scanner_picking_tasks;
CREATE POLICY "Admins can delete scanner picking tasks"
  ON public.scanner_picking_tasks FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated can delete scanner picking task items" ON public.scanner_picking_task_items;
DROP POLICY IF EXISTS "Admins can delete scanner picking task items" ON public.scanner_picking_task_items;
CREATE POLICY "Admins can delete scanner picking task items"
  ON public.scanner_picking_task_items FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));