CREATE OR REPLACE VIEW public.stock_movements_unified
WITH (security_invoker = true) AS
  SELECT id, product_id, movement_type, quantity, reason, reference, notes, created_by, created_at, 'novo'::text AS origem
    FROM public.stock_movements
  UNION ALL
  SELECT id, product_id, movement_type, quantity, reason, reference, notes, created_by, created_at, 'arquivo'::text AS origem
    FROM public.stock_movements_archive;

GRANT SELECT ON public.stock_movements_unified TO authenticated;