
# Correcção do Bug: Stock Duplicado nas Entradas

## Problema Identificado

O stock do produto "teste" mostra **23 sets** quando deveria mostrar **20 sets**.

**Causa raiz:** O sistema está a contar a mesma entrada **duas vezes**:

```text
┌─────────────────────────────────────────────────────────────────┐
│  FLUXO ACTUAL (COM BUG)                                         │
├─────────────────────────────────────────────────────────────────┤
│  1. Utilizador regista entrada de 3 sets                        │
│                                                                 │
│  2. StockEntriesView.tsx:                                       │
│     ├─ Insere em stock_movements (quantity: 3) ✓                │
│     └─ Actualiza counts (+3 para cada coli) ✓                   │
│                                                                 │
│  3. Trigger sync_product_stock:                                 │
│     ├─ base_stock = MIN(coli1, coli2) = MIN(20, 20) = 20       │
│     ├─ entradas = SUM(stock_movements) = 3                      │
│     ├─ picking = 0                                              │
│     └─ current_stock = 20 + 3 - 0 = 23 ❌ DUPLICADO!           │
└─────────────────────────────────────────────────────────────────┘
```

O problema é que a função `handleConfirm` em `StockEntriesView.tsx` **actualiza a tabela counts** E o trigger **soma novamente** as entradas de `stock_movements`.

---

## Solução

Há duas opções para corrigir este problema:

### Opção A: Remover a soma de stock_movements do trigger (Recomendado)

Como a tabela `counts` já é actualizada manualmente, o trigger não deve somar `stock_movements`.

```sql
-- O trigger passa a calcular APENAS:
new_stock = base_stock (de counts) - picking
-- SEM somar entradas de stock_movements
```

### Opção B: Remover a actualização de counts do StockEntriesView

Manter apenas o registo em `stock_movements` e deixar o trigger fazer o cálculo.

**Problema:** Esta opção requer alterar toda a lógica de como os counts são usados na visualização.

---

## Plano de Implementação (Opção A)

### Passo 1: Corrigir os triggers da base de dados

Modificar as 4 funções de trigger para **não somar** `stock_movements`:

| Função | Alteração |
|--------|-----------|
| `sync_product_stock` | Remover soma de stock_movements |
| `sync_stock_on_movement` | Remover soma de stock_movements |
| `sync_stock_on_picking` | Manter lógica de picking |
| `recalculate_all_stock` | Remover soma de stock_movements |

Nova fórmula:
```sql
-- ANTES (errado):
new_stock = base_stock + entradas - picking

-- DEPOIS (correcto):
new_stock = base_stock - picking
```

### Passo 2: Corrigir dados existentes

```sql
-- Recalcular todos os stocks após corrigir os triggers
SELECT recalculate_all_stock();
```

### Passo 3: Manter stock_movements apenas para auditoria

A tabela `stock_movements` continuará a registar os movimentos para fins de histórico/auditoria, mas não afectará o cálculo do stock.

---

## Ficheiros a Modificar

| Tipo | Ficheiro/Objecto | Alteração |
|------|------------------|-----------|
| SQL | `sync_product_stock()` | Remover soma de entradas |
| SQL | `sync_stock_on_movement()` | Remover soma de entradas |
| SQL | `sync_stock_on_picking()` | Remover soma de entradas |
| SQL | `recalculate_all_stock()` | Remover soma de entradas |

---

## Resultado Esperado

Após a correcção:
- Produto "teste": current_stock = 20 (correcto)
- Entradas/saídas administrativas actualizam `counts` directamente
- `stock_movements` serve apenas como histórico
- Fórmula simples: **stock = MIN(colis) - picking**
