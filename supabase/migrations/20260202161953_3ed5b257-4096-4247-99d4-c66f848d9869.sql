-- Permitir múltiplos registos do mesmo coli em localizações diferentes
DROP INDEX IF EXISTS idx_counts_unique_product_colis_session;

CREATE UNIQUE INDEX idx_counts_unique_product_colis_session_location 
ON public.counts USING btree (
  product_id, 
  colis_number, 
  COALESCE(session_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(location, '')
);