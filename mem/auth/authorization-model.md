---
name: Modelo de autorização das operações (assert_app_role)
description: Listas explícitas de funções por RPC, helpers internos sem EXECUTE ao cliente e triggers wo_guard_*
type: feature
---
- `public.assert_app_role(text[])` (SECURITY DEFINER, sem EXECUTE para cliente): exige `auth.uid()`, perfil existente e função na lista. Usar SEMPRE lista explícita — nunca "não é entregador"/"não é warehouse_operator".
- Injetada em: apply_count_delta, set_count_quantity, assign_count_location, merge_colis_counts, split_colis_counts, putaway_counts, complete_location_audit → `master,admin,operator`.
- register_entry, transfer_stock_location, stage_picking_to_dock, load_notes_to_vehicle, deliver_location_audit → `master,admin,operator,warehouse_operator`.
- `REVOKE EXECUTE ... FROM PUBLIC, anon` em todo o schema public. Sem EXECUTE para authenticated: move_stock_qty, debit_counts_at, assert_valid_location, is_quarantine_location, dedupe_counts_same_place, assert_operational_actor, assert_app_role, generate_audit_access_code, generate_route_barcode, wo_guard_*.
- Triggers BEFORE UPDATE `wo_guard_location_audits`, `wo_guard_location_audit_items`, `wo_guard_picking_tasks`: para warehouse_operator congelam campos estruturais/fecho; só permitem `pending → in_progress` e, nos itens, contado/notas/autoria própria. RPCs autorizados marcam `set_config('app.wms_rpc','1',true)` para passarem.
- Testes de RLS/permissões: DO block com identidades sintéticas `TESTE-SINT-*` terminado em `RAISE EXCEPTION` (transação revertida), com `SET LOCAL ROLE anon/authenticated` + `request.jwt.claims`. Nunca concluir política a partir de postgres/service_role.
