-- Remover constraint UNIQUE que impede múltiplos registos por coli
ALTER TABLE counts DROP CONSTRAINT IF EXISTS counts_session_id_product_id_colis_number_key;

-- Criar índice para performance (não-único)
CREATE INDEX IF NOT EXISTS counts_session_product_colis_idx 
ON counts(session_id, product_id, colis_number);