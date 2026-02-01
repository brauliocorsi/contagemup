
# Lógica de Cálculo de Stock - CORRIGIDO

## Modelo Final

O `counts` representa o **inventário físico real**. Quando há entradas ou saídas, os counts são actualizados directamente.

```text
┌─────────────────────────────────────────────────────────────────┐
│  FÓRMULA FINAL                                                  │
├─────────────────────────────────────────────────────────────────┤
│  current_stock = MIN(counts por coli) APENAS                    │
│                                                                 │
│  - stock_movements: apenas auditoria (não afecta fórmula)       │
│  - picking_items: apenas auditoria (não afecta fórmula)         │
│  - counts: fonte de verdade para inventário físico              │
└─────────────────────────────────────────────────────────────────┘
```

## Fluxos

### Entrada de Stock
1. Utilizador regista entrada de N sets
2. `StockEntriesView.tsx`: incrementa `counts` (+N para cada coli)
3. Trigger `sync_product_stock`: calcula `current_stock = MIN(counts)`
4. Regista em `stock_movements` para auditoria

### Saída de Stock (Picking)
1. Utilizador regista saída de N sets
2. `StockExitsView.tsx`: decrementa `counts` (-N para cada coli)
3. Trigger `sync_product_stock`: calcula `current_stock = MIN(counts)`
4. Regista em `picking_items` para auditoria

## Triggers Actualizados

| Função | Comportamento |
|--------|---------------|
| `sync_product_stock` | `current_stock = MIN(counts)` |
| `sync_stock_on_movement` | `current_stock = MIN(counts)` |
| `sync_stock_on_picking` | Não faz nada (picking decrementa counts no frontend) |
| `recalculate_all_stock` | `current_stock = MIN(counts)` |

## Resultado

- **Gestão de Produtos**: mostra `current_stock` = 16
- **Contagem**: mostra `MIN(counts)` = 16
- Ambos mostram o mesmo valor ✓
