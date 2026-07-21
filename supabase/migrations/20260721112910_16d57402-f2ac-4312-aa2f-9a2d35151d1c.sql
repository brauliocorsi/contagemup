
-- Ensure DELETE events carry full row (needed for cache invalidation)
ALTER TABLE public.counts REPLICA IDENTITY FULL;
ALTER TABLE public.products REPLICA IDENTITY FULL;
ALTER TABLE public.product_damages REPLICA IDENTITY FULL;
ALTER TABLE public.stock_movements REPLICA IDENTITY FULL;
ALTER TABLE public.stock_order_numbers REPLICA IDENTITY FULL;

-- Add tables to realtime publication (idempotent per-table)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.product_damages;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_movements;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_order_numbers;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END$$;
