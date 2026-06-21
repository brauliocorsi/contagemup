# Limpeza pós Fase 1 (frontend)

## 1. Apagar `StockDataRepairDialog`
- `rm src/components/settings/StockDataRepairDialog.tsx`
- Em `src/components/settings/SettingsView.tsx`:
  - Remover `import { StockDataRepairDialog }`
  - Remover state `repairDialogOpen` / `setRepairDialogOpen`
  - Remover o bloco "Corrigir Dados Históricos" (cartão com botão "Corrigir") dentro do card "Gestão de Dados"
  - Remover `<StockDataRepairDialog ... />` no fim
  - Limpar import `Database` se deixar de ser usado

## 2. `StockIntegrityReport.tsx`
- Remover a mutation `syncCountsMutation` (linhas ~204–220)
- Remover o `<Button>` "Sincronizar Contagens" (linhas ~325–334)
- Manter `syncStockMutation` (usa `recalculate_all_stock`, que não foi removido) e o resto do componente

## 3. Grep final
Após as alterações, confirmar com `rg` que não há mais referências em `src/` a:
- `sync_counts_with_current_stock`
- `count_false_movements`
- `cleanup_false_movements`
- `StockDataRepairDialog`

## 4. Resposta final
- Listar ficheiros alterados
- Colar o SQL completo da migration aplicada (`supabase/migrations/20260621100051_*.sql`), com as 4 funções `register_entry`, `commit_exit_cart`, `register_damage`, `resolve_damage` na íntegra
