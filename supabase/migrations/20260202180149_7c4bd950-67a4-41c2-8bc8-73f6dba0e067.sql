-- Create location_audits table for storing audit sessions
CREATE TABLE public.location_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  locations TEXT[] NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_by UUID,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create location_audit_items table for storing individual audit items
CREATE TABLE public.location_audit_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL REFERENCES public.location_audits(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id),
  product_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  location TEXT NOT NULL,
  pallet_number TEXT,
  colis_number INTEGER,
  expected_quantity INTEGER NOT NULL DEFAULT 0,
  counted_quantity INTEGER,
  difference INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  counted_by UUID,
  counted_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on both tables
ALTER TABLE public.location_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_audit_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for location_audits
CREATE POLICY "Authenticated users can view audits"
ON public.location_audits FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create audits"
ON public.location_audits FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update audits"
ON public.location_audits FOR UPDATE
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete audits"
ON public.location_audits FOR DELETE
USING (auth.uid() IS NOT NULL);

-- RLS policies for location_audit_items
CREATE POLICY "Authenticated users can view audit items"
ON public.location_audit_items FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create audit items"
ON public.location_audit_items FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update audit items"
ON public.location_audit_items FOR UPDATE
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete audit items"
ON public.location_audit_items FOR DELETE
USING (auth.uid() IS NOT NULL);

-- Create trigger for updated_at on location_audits
CREATE TRIGGER update_location_audits_updated_at
BEFORE UPDATE ON public.location_audits
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_location_audits_status ON public.location_audits(status);
CREATE INDEX idx_location_audits_created_by ON public.location_audits(created_by);
CREATE INDEX idx_location_audit_items_audit_id ON public.location_audit_items(audit_id);
CREATE INDEX idx_location_audit_items_location ON public.location_audit_items(location);
CREATE INDEX idx_location_audit_items_status ON public.location_audit_items(status);