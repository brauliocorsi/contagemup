ALTER TABLE public.delivery_note_payables ALTER COLUMN note_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payables_route_sale ON public.delivery_note_payables (route_id, gc_sale_code) WHERE active;