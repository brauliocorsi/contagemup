-- Create product_history table for tracking changes
CREATE TABLE public.product_changes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  changed_by UUID REFERENCES auth.users(id),
  change_type TEXT NOT NULL CHECK (change_type IN ('created', 'updated', 'deleted')),
  field_changed TEXT,
  old_value TEXT,
  new_value TEXT,
  changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.product_changes ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Authenticated users can view product changes"
ON public.product_changes
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert product changes"
ON public.product_changes
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Create index for faster queries
CREATE INDEX idx_product_changes_product_id ON public.product_changes(product_id);
CREATE INDEX idx_product_changes_changed_at ON public.product_changes(changed_at DESC);