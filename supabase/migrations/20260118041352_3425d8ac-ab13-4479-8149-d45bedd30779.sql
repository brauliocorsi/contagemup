-- Create table for stock reconciliations
CREATE TABLE public.reconciliations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'validated', 'cancelled')),
  created_by UUID REFERENCES auth.users(id),
  validated_by UUID REFERENCES auth.users(id),
  validated_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for reconciliation items (comparison details)
CREATE TABLE public.reconciliation_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reconciliation_id UUID NOT NULL REFERENCES public.reconciliations(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id),
  product_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  expected_quantity INTEGER NOT NULL DEFAULT 0,
  counted_quantity INTEGER NOT NULL DEFAULT 0,
  difference INTEGER GENERATED ALWAYS AS (counted_quantity - expected_quantity) STORED,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('match', 'surplus', 'shortage', 'not_found')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for reconciliations
CREATE POLICY "Authenticated users can view reconciliations"
ON public.reconciliations
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create reconciliations"
ON public.reconciliations
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update reconciliations"
ON public.reconciliations
FOR UPDATE
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete reconciliations"
ON public.reconciliations
FOR DELETE
USING (auth.uid() IS NOT NULL);

-- RLS policies for reconciliation_items
CREATE POLICY "Authenticated users can view reconciliation items"
ON public.reconciliation_items
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create reconciliation items"
ON public.reconciliation_items
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update reconciliation items"
ON public.reconciliation_items
FOR UPDATE
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete reconciliation items"
ON public.reconciliation_items
FOR DELETE
USING (auth.uid() IS NOT NULL);

-- Triggers for updated_at
CREATE TRIGGER update_reconciliations_updated_at
BEFORE UPDATE ON public.reconciliations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_reconciliation_items_updated_at
BEFORE UPDATE ON public.reconciliation_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();