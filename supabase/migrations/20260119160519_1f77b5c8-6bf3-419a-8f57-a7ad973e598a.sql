-- Add location and pallet_number columns to reconciliation_items table
ALTER TABLE public.reconciliation_items 
ADD COLUMN location text,
ADD COLUMN pallet_number text;