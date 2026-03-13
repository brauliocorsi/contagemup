

## Diagnóstico do Problema

A "Cama Armani" tinha stock 1, foi vendida 1 unidade na venda #15713, e aparece como **-1** no módulo de Compras. Isto acontece porque há **dupla contagem da saída**:

1. Quando a venda foi processada/entregue, o stock foi decrementado (via picking ou saída manual): `current_stock` passou de **1 → 0**
2. O módulo de Compras lê o `current_stock` actual (já **0**) e subtrai novamente o `totalSold` (1): `0 - 1 = -1`

O cálculo actual é: `stockAfterSale = current_stock - totalSold`, mas o `current_stock` **já reflecte** as saídas feitas. Está a subtrair duas vezes.

## Solução Proposta

Ajustar o cálculo para considerar as saídas de stock já realizadas no período seleccionado. Duas abordagens possíveis:

### Opção A — Verificar saídas já processadas (recomendada)
Para cada produto vendido, consultar os `stock_movements` (tipo saída/picking) no mesmo período de datas. Se já houve saída, descontar do `totalSold` para evitar dupla contagem:

```
stockAfterSale = current_stock - max(0, totalSold - saidasJaProcessadas)
```

### Opção B — Usar stock bruto (sem saídas)
Recalcular o stock "antes das saídas do dia" somando de volta os movimentos de saída do período ao `current_stock`:

```
stockAntesSaidas = current_stock + saidasDoPeriodo
stockAfterSale = stockAntesSaidas - totalSold
```

### Alterações necessárias

1. **`PurchaseOrdersView.tsx`**: Ao enriquecer os itens vendidos, buscar os `stock_movements` do período (tipo `exit` e `picking`) agrupados por `product_id`, e ajustar o cálculo do défice.

2. **Query adicional**: Antes do enriquecimento, fazer uma query:
```sql
SELECT product_id, SUM(ABS(quantity)) as total_exits
FROM stock_movements
WHERE movement_type IN ('exit', 'picking')
  AND created_at >= dateFrom AND created_at <= dateTo+1
GROUP BY product_id
```

3. **Lógica corrigida**:
```typescript
const exits = exitsMap.get(productId) ?? 0;
const alreadyDeducted = Math.min(exits, item.totalSold);
const pendingToDeduct = item.totalSold - alreadyDeducted;
const stockAfterSale = currentStock - pendingToDeduct;
```

Isto garante que produtos já saídos do armazém não aparecem como "a comprar".

## Secção Técnica

- Ficheiro principal: `src/components/purchases/PurchaseOrdersView.tsx`
- Tabela consultada: `stock_movements` (campos: `product_id`, `quantity`, `movement_type`, `created_at`)
- Também incluir `picking_items` via `picking_sessions` para saídas de picking no período
- O match entre produto ERP e produto local é feito por código (`productCode` → `products.code`)

