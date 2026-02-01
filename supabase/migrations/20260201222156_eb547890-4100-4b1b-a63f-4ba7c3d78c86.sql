-- Criar índice único para prevenir futuros duplicados
-- Usar COALESCE para tratar session_id NULL como valor fixo
CREATE UNIQUE INDEX IF NOT EXISTS idx_counts_unique_product_colis_session 
ON counts (product_id, colis_number, COALESCE(session_id, '00000000-0000-0000-0000-000000000000'));