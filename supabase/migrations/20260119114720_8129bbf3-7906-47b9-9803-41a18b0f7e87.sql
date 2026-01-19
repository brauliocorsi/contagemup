-- Add location and pallet_number columns to products table
ALTER TABLE public.products 
ADD COLUMN location text DEFAULT NULL,
ADD COLUMN pallet_number text DEFAULT NULL;

-- Create indexes for better search performance
CREATE INDEX idx_products_location ON public.products(location);
CREATE INDEX idx_products_pallet_number ON public.products(pallet_number);