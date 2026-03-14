
-- Create delivery_regions table
CREATE TABLE public.delivery_regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  postal_prefix_start text NOT NULL,
  postal_prefix_end text NOT NULL,
  default_weekday integer,
  color text DEFAULT '#3B82F6',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.delivery_regions ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can view delivery regions" ON public.delivery_regions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create delivery regions" ON public.delivery_regions FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update delivery regions" ON public.delivery_regions FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete delivery regions" ON public.delivery_regions FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- Add region_id to route_schedules
ALTER TABLE public.route_schedules ADD COLUMN region_id uuid REFERENCES public.delivery_regions(id);

-- Add freguesia and municipio to route_stops
ALTER TABLE public.route_stops ADD COLUMN freguesia text;
ALTER TABLE public.route_stops ADD COLUMN municipio text;

-- Updated_at trigger for delivery_regions
CREATE TRIGGER update_delivery_regions_updated_at BEFORE UPDATE ON public.delivery_regions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
