---
name: Master Role
description: Só o papel Master cria/elimina utilizadores e altera funções; Master inclui poderes de admin e financeiro
type: feature
---
- Braulio Corsi (user_id e7583d9a-9b09-4b3b-a588-2494742ce90a) é `master`.
- `has_role()` devolve true para qualquer papel quando o utilizador é master; `is_finance` inclui master.
- `set_user_role` RPC: só master; master não pode rebaixar-se a si próprio. Trigger `prevent_profile_role_change` permite bypass via `app.allow_role_change=on` (definido dentro do RPC) ou service_role.
- Criação/eliminação de contas: edge function `admin-manage-users` (service role, só master). Registo público continua desativado.
- `admin-set-password` aceita admin ou master.
- UI: `SettingsView.tsx` usa `isMaster` para criar/eliminar/alterar funções.
