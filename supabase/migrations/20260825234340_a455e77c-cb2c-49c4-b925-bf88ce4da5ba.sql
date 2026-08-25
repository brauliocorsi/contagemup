DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.warehouse_locations'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%location_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.warehouse_locations DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.warehouse_locations
  ADD CONSTRAINT warehouse_locations_location_type_check
  CHECK (location_type IN ('stock','pre_exit','transport','quarantine','conferencia'));

INSERT INTO public.warehouse_locations (code, location_type, position_in_aisle, is_staging, notes)
SELECT 'CONF', 'conferencia', 0, false, 'Zona de conferência / receção de material'
WHERE NOT EXISTS (SELECT 1 FROM public.warehouse_locations WHERE upper(code) = 'CONF');

UPDATE public.warehouse_locations
SET location_type = 'conferencia', aisle_id = NULL, level_id = NULL
WHERE upper(code) = 'CONF';