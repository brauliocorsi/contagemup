-- Add colis_names column to categories table for storing custom names per coli number
ALTER TABLE public.categories 
ADD COLUMN colis_names jsonb DEFAULT NULL;