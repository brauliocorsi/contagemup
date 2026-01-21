-- Create picking_sessions table
CREATE TABLE public.picking_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reference TEXT,
  reason TEXT,
  notes TEXT,
  total_products INTEGER NOT NULL DEFAULT 0,
  total_units INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'completed'
);

-- Create picking_items table
CREATE TABLE public.picking_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  picking_session_id UUID NOT NULL REFERENCES public.picking_sessions(id) ON DELETE CASCADE,
  product_id UUID,
  product_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  location TEXT,
  pallet_number TEXT,
  requires_forklift BOOLEAN NOT NULL DEFAULT false,
  level_name TEXT,
  aisle_name TEXT,
  picked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on both tables
ALTER TABLE public.picking_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.picking_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for picking_sessions
CREATE POLICY "Authenticated users can view picking sessions"
ON public.picking_sessions
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create picking sessions"
ON public.picking_sessions
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update picking sessions"
ON public.picking_sessions
FOR UPDATE
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete picking sessions"
ON public.picking_sessions
FOR DELETE
USING (auth.uid() IS NOT NULL);

-- RLS policies for picking_items
CREATE POLICY "Authenticated users can view picking items"
ON public.picking_items
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create picking items"
ON public.picking_items
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete picking items"
ON public.picking_items
FOR DELETE
USING (auth.uid() IS NOT NULL);

-- Create indexes for performance
CREATE INDEX idx_picking_sessions_created_at ON public.picking_sessions(created_at DESC);
CREATE INDEX idx_picking_sessions_created_by ON public.picking_sessions(created_by);
CREATE INDEX idx_picking_items_session_id ON public.picking_items(picking_session_id);
CREATE INDEX idx_picking_items_product_id ON public.picking_items(product_id);