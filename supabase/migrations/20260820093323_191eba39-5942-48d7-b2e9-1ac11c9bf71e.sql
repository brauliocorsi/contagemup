ALTER TABLE public.warehouse_locations
  ADD COLUMN IF NOT EXISTS is_staging boolean NOT NULL DEFAULT false;