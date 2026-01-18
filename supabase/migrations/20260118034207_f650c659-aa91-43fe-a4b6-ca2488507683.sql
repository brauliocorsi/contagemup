-- Add category column to counting_sessions table
ALTER TABLE public.counting_sessions ADD COLUMN category text NOT NULL DEFAULT 'Todas';