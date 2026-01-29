-- 1. Criar sessão de sistema para movimentos administrativos
INSERT INTO counting_sessions (id, name, category, status)
VALUES (
  'a0000000-0000-0000-0000-000000000001', 
  'Sistema - Movimentos Administrativos', 
  'Todas', 
  'active'
)
ON CONFLICT (id) DO NOTHING;

-- 2. Remover movimentos redundantes criados pela contagem (duplicam lógica do trigger)
DELETE FROM stock_movements 
WHERE reason = 'Contagem - Sessão';