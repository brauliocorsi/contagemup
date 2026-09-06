ALTER TABLE public.delivery_notes DROP CONSTRAINT IF EXISTS delivery_notes_status_check;
ALTER TABLE public.delivery_notes ADD CONSTRAINT delivery_notes_status_check
  CHECK (status = ANY (ARRAY['picking'::text,'staged'::text,'loaded'::text,'delivered'::text,'returned'::text,'partial'::text,'not_delivered'::text,'cancelled'::text]));