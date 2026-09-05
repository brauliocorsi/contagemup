ALTER TABLE public.scanner_picking_tasks ADD COLUMN IF NOT EXISTS route_id uuid REFERENCES public.route_schedules(id) ON DELETE SET NULL;
ALTER TABLE public.delivery_notes ADD COLUMN IF NOT EXISTS route_id uuid REFERENCES public.route_schedules(id) ON DELETE SET NULL;
ALTER TABLE public.route_schedules ADD COLUMN IF NOT EXISTS vehicle_location_id uuid REFERENCES public.warehouse_locations(id) ON DELETE SET NULL;
ALTER TABLE public.route_schedules ADD COLUMN IF NOT EXISTS barcode text;
ALTER TABLE public.warehouse_locations ADD COLUMN IF NOT EXISTS plate text;
ALTER TABLE public.scanner_picking_task_items ADD COLUMN IF NOT EXISTS excluded boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_scanner_picking_tasks_route ON public.scanner_picking_tasks(route_id);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_route ON public.delivery_notes(route_id);

CREATE OR REPLACE FUNCTION public.generate_route_barcode()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_alphabet text := '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  i integer;
BEGIN
  LOOP
    v_code := 'ROTA-';
    FOR i IN 1..6 LOOP
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.route_schedules WHERE barcode = v_code);
  END LOOP;
  RETURN v_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_route_barcode()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.barcode IS NULL OR btrim(NEW.barcode) = '' THEN
    NEW.barcode := public.generate_route_barcode();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_route_schedules_barcode ON public.route_schedules;
CREATE TRIGGER trg_route_schedules_barcode
BEFORE INSERT ON public.route_schedules
FOR EACH ROW EXECUTE FUNCTION public.set_route_barcode();

UPDATE public.route_schedules
SET barcode = public.generate_route_barcode()
WHERE barcode IS NULL OR btrim(barcode) = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_route_schedules_barcode ON public.route_schedules(barcode);

UPDATE public.warehouse_locations
SET plate = upper(split_part(code, '-', 2))
WHERE location_type = 'transport'
  AND plate IS NULL
  AND position('-' in code) > 0;