-- Add min_stock column to products for customizable stock alerts
ALTER TABLE public.products ADD COLUMN min_stock INTEGER NOT NULL DEFAULT 5;