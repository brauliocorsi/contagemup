-- Remover constraint antiga que não inclui pallet_number
DROP INDEX IF EXISTS idx_counts_unique_product_colis_session_location;

-- Criar nova constraint que inclui pallet_number
-- Isto permite ter o mesmo coli na mesma localização mas em paletes diferentes
CREATE UNIQUE INDEX idx_counts_unique_product_colis_session_location_pallet 
ON public.counts USING btree (
  product_id, 
  colis_number, 
  COALESCE(session_id, '00000000-0000-0000-0000-000000000000'::uuid), 
  COALESCE(location, ''::text),
  COALESCE(pallet_number, ''::text)
);