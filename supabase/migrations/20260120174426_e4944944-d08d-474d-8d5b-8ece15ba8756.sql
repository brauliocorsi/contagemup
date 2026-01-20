-- Create warehouse aisles table (Ruas/Corredores)
CREATE TABLE public.warehouse_aisles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  color TEXT DEFAULT '#3B82F6',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create warehouse levels table (Níveis/Andares)
CREATE TABLE public.warehouse_levels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  level_number INTEGER NOT NULL DEFAULT 0,
  requires_forklift BOOLEAN NOT NULL DEFAULT false,
  color TEXT DEFAULT '#10B981',
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create warehouse locations table (Localizações específicas)
CREATE TABLE public.warehouse_locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  aisle_id UUID REFERENCES public.warehouse_aisles(id) ON DELETE SET NULL,
  level_id UUID REFERENCES public.warehouse_levels(id) ON DELETE SET NULL,
  position_in_aisle INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create warehouse pallets table (Paletes)
CREATE TABLE public.warehouse_pallets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  current_location_id UUID REFERENCES public.warehouse_locations(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.warehouse_aisles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_pallets ENABLE ROW LEVEL SECURITY;

-- RLS policies for warehouse_aisles
CREATE POLICY "Authenticated users can view aisles" ON public.warehouse_aisles FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can create aisles" ON public.warehouse_aisles FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update aisles" ON public.warehouse_aisles FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete aisles" ON public.warehouse_aisles FOR DELETE USING (auth.uid() IS NOT NULL);

-- RLS policies for warehouse_levels
CREATE POLICY "Authenticated users can view levels" ON public.warehouse_levels FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can create levels" ON public.warehouse_levels FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update levels" ON public.warehouse_levels FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete levels" ON public.warehouse_levels FOR DELETE USING (auth.uid() IS NOT NULL);

-- RLS policies for warehouse_locations
CREATE POLICY "Authenticated users can view locations" ON public.warehouse_locations FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can create locations" ON public.warehouse_locations FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update locations" ON public.warehouse_locations FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete locations" ON public.warehouse_locations FOR DELETE USING (auth.uid() IS NOT NULL);

-- RLS policies for warehouse_pallets
CREATE POLICY "Authenticated users can view pallets" ON public.warehouse_pallets FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can create pallets" ON public.warehouse_pallets FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update pallets" ON public.warehouse_pallets FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete pallets" ON public.warehouse_pallets FOR DELETE USING (auth.uid() IS NOT NULL);

-- Create indexes for better performance
CREATE INDEX idx_warehouse_locations_aisle ON public.warehouse_locations(aisle_id);
CREATE INDEX idx_warehouse_locations_level ON public.warehouse_locations(level_id);
CREATE INDEX idx_warehouse_locations_code ON public.warehouse_locations(code);
CREATE INDEX idx_warehouse_pallets_location ON public.warehouse_pallets(current_location_id);
CREATE INDEX idx_warehouse_pallets_code ON public.warehouse_pallets(code);

-- Create triggers for updated_at
CREATE TRIGGER update_warehouse_aisles_updated_at BEFORE UPDATE ON public.warehouse_aisles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_warehouse_levels_updated_at BEFORE UPDATE ON public.warehouse_levels FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_warehouse_locations_updated_at BEFORE UPDATE ON public.warehouse_locations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_warehouse_pallets_updated_at BEFORE UPDATE ON public.warehouse_pallets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default levels
INSERT INTO public.warehouse_levels (name, short_name, level_number, requires_forklift, color, display_order) VALUES
  ('Chão', 'CH', 0, false, '#10B981', 0),
  ('Nível 1', 'N1', 1, false, '#3B82F6', 1),
  ('Nível 2', 'N2', 2, true, '#F59E0B', 2),
  ('Nível 3', 'N3', 3, true, '#EF4444', 3),
  ('Nível 4', 'N4', 4, true, '#7C3AED', 4);