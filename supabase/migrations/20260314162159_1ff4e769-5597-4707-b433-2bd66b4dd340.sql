
ALTER TABLE public.route_schedules
  ADD COLUMN IF NOT EXISTS departure_address text,
  ADD COLUMN IF NOT EXISTS departure_postal_code text,
  ADD COLUMN IF NOT EXISTS departure_lat double precision,
  ADD COLUMN IF NOT EXISTS departure_lon double precision,
  ADD COLUMN IF NOT EXISTS return_to_base boolean NOT NULL DEFAULT false;
