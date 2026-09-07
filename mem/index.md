- [Master Role](mem://auth/master-role) — Só o Master (Braulio) gere utilizadores; master inclui admin+financeiro
- [Operador de armazém](mem://auth/warehouse-operator-role) — Papel warehouse_operator exclusivo do scanner, travas RLS/RPC no servidor

- [Modelo de autorização](mem://auth/authorization-model) — assert_app_role com listas explícitas de funções, revokes de helpers e triggers wo_guard_*
