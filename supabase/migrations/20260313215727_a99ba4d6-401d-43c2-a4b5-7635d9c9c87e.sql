
-- Route schedules (agendamento de rotas)
CREATE TABLE public.route_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  scheduled_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Route stops (paragens da rota com dados do cliente)
CREATE TABLE public.route_stops (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  route_id UUID NOT NULL REFERENCES public.route_schedules(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  address TEXT,
  postal_code TEXT,
  city TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  order_number INTEGER NOT NULL DEFAULT 0,
  venda_id TEXT,
  venda_codigo TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.route_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_stops ENABLE ROW LEVEL SECURITY;

-- RLS policies for route_schedules
CREATE POLICY "Authenticated users can view routes" ON public.route_schedules FOR SELECT TO public USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can create routes" ON public.route_schedules FOR INSERT TO public WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update routes" ON public.route_schedules FOR UPDATE TO public USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete routes" ON public.route_schedules FOR DELETE TO public USING (auth.uid() IS NOT NULL);

-- RLS policies for route_stops
CREATE POLICY "Authenticated users can view route stops" ON public.route_stops FOR SELECT TO public USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can create route stops" ON public.route_stops FOR INSERT TO public WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update route stops" ON public.route_stops FOR UPDATE TO public USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete route stops" ON public.route_stops FOR DELETE TO public USING (auth.uid() IS NOT NULL);
