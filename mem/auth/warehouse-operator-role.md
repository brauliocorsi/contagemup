---
name: Operador de armazém (warehouse_operator)
description: Papel exclusivo do scanner; travas de RLS e RPC que impedem gestão do sistema
type: feature
---
- Papel `warehouse_operator` ("Operador de armazém"). NÃO reutilizar `operator` — `is_delivery_manager` trata `operator` como gestor.
- Deteção: `public.is_warehouse_operator(uid)` (estrita, o master NÃO conta). Nunca usar `has_role` para isto.
- Login entra direto em `/scanner` (`src/hooks/useRoleAccess.tsx` + `Index.tsx`); sem dashboard, definições, relatórios, finanças, rotas nem `/entregador`. Perfil por carregar = sem acesso.
- No scanner: identidade + Sair, sem "Voltar à aplicação", sem módulo Cód. Fornecedor (também bloqueado por comando CMD-MODE).
- Servidor: políticas RESTRICTIVE `wo_*` em 34 tabelas bloqueiam escrita direta (produtos, notas, rotas, counts, movimentos, config) e leitura de dados comerciais (caches ERP, guias, planos, meios de pagamento). Conferências: só as `assigned_to = auth.uid()`.
- `public.assert_operational_actor()` está injetada em admin_reset_stock_data, recalculate_all_stock, merge_duplicate_products, dedupe_counts_same_place, commit_exit_cart, reverse_stock_movement, resolve/regularize/undo_regularize_damage, merge/split_colis_counts.
- `load_notes_to_vehicle` recusa `p_items` vazio para este papel (carregar rota/nota inteira sem conferência).
- Criação/eliminação/alteração de papel continua só do Master (`set_user_role`, `admin-manage-users`).
