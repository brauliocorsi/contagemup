# Fase 1 — Autorização admin no backend

Blindar operações destrutivas ao nível da BD. Hoje todas as políticas DELETE usam apenas `auth.uid() IS NOT NULL`, portanto qualquer operador autenticado pode apagar tudo via API direta mesmo com a UI a esconder botões. O reset também é feito no cliente em ~13 DELETEs sequenciais, sem transação.

## O que vai ser feito

### 1. Migração SQL (uma única migration)

**1.1. Função `public.has_role(_user_id uuid, _role text)`**
- `SECURITY DEFINER`, `STABLE`, `SET search_path = public`
- Lê `profiles.role` (o modelo já em uso; existe um trigger `prevent_profile_role_change` que impede escalada por UPDATE direto ao perfil, portanto usar `profiles` mantém-se seguro nesta fase)
- `GRANT EXECUTE` a `authenticated` e `service_role`

**1.2. Substituir política DELETE nestas 11 tabelas para exigir `has_role(auth.uid(), 'admin')`:**
`products, counts, count_logs, stock_movements, counting_sessions, reconciliations, reconciliation_items, picking_items, picking_sessions, location_audit_items, categories`

Para cada tabela: `DROP POLICY` da atual + `CREATE POLICY ... FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'))`.

Não mexer nas políticas de SELECT/INSERT/UPDATE nem nas restantes tabelas (route_stops já tem regra própria, warehouse_*, damages, etc. ficam como estão nesta fase — o roadmap indica-as explicitamente).

Nota: `count_logs` não aparece hoje na lista de policies DELETE (só tem 2 policies). Se não tiver policy DELETE, criar uma nova admin-only em vez de fazer replace.

**1.3. RPC `public.admin_reset_stock_data()`**
- `SECURITY DEFINER`, `SET search_path = public`, retorna `jsonb`
- Primeiro passo: `IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501'; END IF;`
- Numa única transação (a própria função já corre em transação), `DELETE` em cascata pela ordem de FKs:
  1. `picking_items`, `count_logs`, `reconciliation_items`, `location_audit_items`
  2. `counts`, `stock_movements`
  3. `picking_sessions`, `reconciliations`, `location_audits`, `counting_sessions`
  4. `product_damages` (referenciado pelo prompt do utilizador na Fase original — manter alinhado com o ResetStockDialog atual que também limpa `product_damages` e `product_changes`)
- Cada `DELETE ... RETURNING 1` agregado num contador; devolve `jsonb_build_object('counts', n, 'stock_movements', n, ...)`
- `GRANT EXECUTE` só a `authenticated` (a verificação de role está no corpo)

Não mexer em: `products`, `categories`, `warehouse_*`, `profiles`, `user_roles`, `delivery_regions` (preserva o que o ResetStockDialog atual já preservava).

### 2. Frontend — `src/components/settings/ResetStockDialog.tsx`

Substituir os ~13 `supabase.from(...).delete()` + o `UPDATE products` por uma única chamada:

```ts
const { data, error } = await supabase.rpc('admin_reset_stock_data');
```

- Se `error?.code === '42501'` (ou mensagem contém `insufficient_privilege`): toast "Apenas administradores podem executar esta operação".
- Outro erro: usar `mapDatabaseError` (já existe em `src/lib/errorMessages.ts`).
- Sucesso: toast com resumo formatado a partir do `data` retornado (ex.: "Contagens: 2 359, Movimentos: 0, Sessões: 4, ...").
- Manter a UI (campo CONFIRMAR, badges verdes/vermelhas, `progress` fica desnecessário — passa a um único spinner "A executar reset...").
- Invalidar as mesmas queries que hoje.

**Nota importante sobre `products.current_stock`:** hoje o dialog fazia `UPDATE products SET current_stock = 0`. Isso deixa de ser feito no cliente. Como o trigger `sync_product_stock_trigger` está ativo em `counts`, ao apagar todas as linhas de `counts` o `current_stock` é recalculado para 0 automaticamente por produto. A RPC não precisa (e não deve) tocar em `products`.

### 3. Fora do âmbito desta fase
- Edge functions (Fase 2)
- Migrar `role` de `profiles` para `user_roles` — o memory sugere isso mas mudaria a superfície de auth; o utilizador optou explicitamente por `profiles.role` no prompt. Fica para eventual fase futura.
- Qualquer outra tabela DELETE (warehouse, damages, order_numbers) — não estão no âmbito.

## Detalhes técnicos

- Migration é criada via `supabase--migration`; requer aprovação do utilizador antes de correr.
- Depois da migration aprovada, o `types.ts` regenera-se e a chamada `supabase.rpc('admin_reset_stock_data')` fica tipada automaticamente.
- Verificação pós-aplicação (read-only):
  - `SELECT proname FROM pg_proc WHERE proname IN ('has_role','admin_reset_stock_data');` devolve 2 linhas
  - `SELECT tablename, qual FROM pg_policies WHERE cmd='DELETE' AND tablename IN (...11 tabelas...);` mostra `has_role` em todas
  - Testar o toast de erro fazendo login como operador e clicar Reset → deve falhar com 42501 antes de apagar nada.

## Ficheiros
- Nova migration (via ferramenta)
- `src/components/settings/ResetStockDialog.tsx` — substituir corpo de `handleReset`
