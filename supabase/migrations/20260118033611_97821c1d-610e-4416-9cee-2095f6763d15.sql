-- Add category column to products table
ALTER TABLE public.products ADD COLUMN category text NOT NULL DEFAULT 'Geral';

-- Create an index for better filtering performance
CREATE INDEX idx_products_category ON public.products (category);