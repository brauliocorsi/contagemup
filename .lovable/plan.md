
# Plano Completo: Sistema de Gestão de Stock com Colis e Encomendas

## Análise do Estado Actual

Após análise detalhada do código, o sistema já possui muitas das funcionalidades mencionadas, mas precisa de ajustes para funcionar de forma coesa. Aqui está o diagnóstico:

### O Que Já Existe

| Funcionalidade | Estado | Ficheiros |
|---|---|---|
| Rastreio por encomenda | ✅ Implementado | `useOrderNumbers.tsx`, `stock_order_numbers` |
| Colis por categoria | ✅ Implementado | Categorias com `colis_names` |
| Entradas com encomenda | ✅ Implementado | `StockEntriesView.tsx`, `OrderNumberEntrySelector` |
| Saídas por encomenda | ✅ Parcial | `OrderNumberExitSelector` existe mas precisa melhorias |
| Sets completos vs incompletos | ✅ Corrigido | Trigger `sync_product_stock` actualizado |
| Localização por coli | ✅ Implementado | `SplitStockDialog`, `ColisDetail` |
| Relatórios de movimentos | ✅ Básico | `StockMovementsReport`, `CountingMovementsReport` |

### O Que Precisa Ser Feito

| Ponto | Requisito | Acção |
|---|---|---|
| 7 | Aba de produtos com encomendas | ❌ **Criar** nova tab/filtro |
| 8 | Pesquisa por nº encomenda nas saídas | ⚠️ **Melhorar** search |
| 10 | Movimentação por coli nos relatórios | ⚠️ **Adicionar** detalhe |
| 11 | Sets completos saídos nos relatórios | ⚠️ **Adicionar** métricas |
| 9 | Fiabilidade stock em todo sistema | ⚠️ **Verificar** consistência |

---

## Plano de Implementação

### Fase 1: Aba de Produtos com Encomendas (Ponto 7)

Criar um novo filtro/tab na gestão de produtos para mostrar apenas produtos que têm encomendas associadas.

**Alterações:**
- `ProductsView.tsx`: Adicionar filtro "Com Encomendas" 
- Criar query para buscar produtos com registos em `stock_order_numbers`

**Visualização esperada:**
```text
[Todos] [Com Stock] [Sem Stock] [Com Encomendas] [Incompletos]
                                    ↑ NOVO
```

### Fase 2: Pesquisa por Nº Encomenda nas Saídas (Ponto 8)

Melhorar a pesquisa na interface de saídas para permitir busca por número de encomenda.

**Alterações:**
- `ManualStockSection.tsx`: Expandir lógica de pesquisa
- `StockExitsView.tsx`: Adicionar campo de busca dedicado para encomenda
- Ao seleccionar encomenda, pré-seleccionar produto automaticamente

**Fluxo esperado:**
```text
1. Utilizador digita "ENC-2024-001" no search
2. Sistema mostra produtos que têm essa encomenda
3. Ao clicar, expande automaticamente o selector de encomenda
4. Utilizador confirma e adiciona ao carrinho
```

### Fase 3: Relatórios Detalhados por Coli (Pontos 10 e 11)

Actualizar os relatórios existentes para incluir:
- Movimentação discriminada por coli
- Contagem de sets completos saídos
- Resumo de encomendas processadas

**Alterações em `StockMovementsReport.tsx`:**
- Adicionar coluna "Sets Saídos" 
- Adicionar filtro por categoria com colis
- Mostrar breakdown por coli quando aplicável

**Nova secção em relatórios:**
```text
┌──────────────────────────────────────────┐
│ Resumo de Saídas por Sets                │
├──────────────────────────────────────────┤
│ Produto          │ Sets │ Colis Total    │
│ Cama Boss 180    │  5   │ 10 (2x5)       │
│ Cama Alice 140   │  3   │  6 (2x3)       │
└──────────────────────────────────────────┘
```

**Alterações em `ReportsView.tsx`:**
- Adicionar sub-tab "Encomendas" 
- Mostrar encomendas processadas por período
- Incluir status: entregue, pendente, parcial

### Fase 4: Consistência do Stock (Ponto 9)

Verificar que o stock é consistente em todas as interfaces:

| Interface | Campo | Fonte |
|---|---|---|
| ProductsView | `current_stock` | `products.current_stock` |
| CountingView | Sets completos | MIN(coli_1, coli_2, ...) calculado |
| StockExitsView | Disponível | `products.current_stock` |
| Relatórios | Total | `products.current_stock` |

**Trigger já corrigido** para usar `GREATEST(product.total_colis, category.colis_count)`

**Acção adicional:**
- Adicionar validação em `StockExitsView` para verificar stock por coli antes de confirmar
- Garantir que picking decrementa counts correctamente

---

## Resumo Técnico das Alterações

### Ficheiros a Criar

| Ficheiro | Descrição |
|---|---|
| `src/components/products/OrderedProductsFilter.tsx` | Componente de filtro para produtos com encomendas |
| `src/hooks/useProductsWithOrders.tsx` | Hook para buscar produtos com encomendas activas |

### Ficheiros a Modificar

| Ficheiro | Alterações |
|---|---|
| `src/components/products/ProductsView.tsx` | Adicionar filtro "Com Encomendas", expandir coluna de info |
| `src/components/stock/ManualStockSection.tsx` | Pesquisa por nº encomenda, resultado com highlight |
| `src/components/stock/StockExitsView.tsx` | Campo dedicado para busca por encomenda |
| `src/components/reports/StockMovementsReport.tsx` | Coluna sets, breakdown por coli, secção resumo |
| `src/components/reports/ReportsView.tsx` | Adicionar tab/secção de encomendas processadas |
| `src/components/layout/Navigation.tsx` | (Opcional) Adicionar item "Encomendas" se preferir tab dedicada |

### Consultas SQL Necessárias

**Produtos com encomendas:**
```sql
SELECT DISTINCT p.* 
FROM products p
INNER JOIN stock_order_numbers son ON p.id = son.product_id
WHERE EXISTS (
  SELECT 1 FROM stock_order_numbers 
  WHERE product_id = p.id
)
```

**Encomendas por período:**
```sql
SELECT 
  p.code, p.name, son.order_number, 
  son.colis_status, son.created_at
FROM stock_order_numbers son
JOIN products p ON son.product_id = p.id
WHERE son.created_at BETWEEN $1 AND $2
ORDER BY son.created_at DESC
```

---

## Checklist de Validação

Após implementação, verificar:

- [ ] Produtos de encomenda mostram colis e encomendas associadas (Ponto 1)
- [ ] Colis completos (stock + encomendas) contam como stock (Ponto 2)
- [ ] Colis incompletos mostram como "X Partes Soltas" (Ponto 3)
- [ ] Cada coli tem localização visível e editável (Pontos 4 e 5)
- [ ] Entradas podem ser por coli individual ou set completo (Ponto 6)
- [ ] Filtro "Com Encomendas" funciona em ProductsView (Ponto 7)
- [ ] Pesquisa por nº encomenda funciona em Saídas (Ponto 8)
- [ ] Stock consistente em todas as interfaces (Ponto 9)
- [ ] Relatórios mostram movimentação por coli (Ponto 10)
- [ ] Relatórios mostram sets completos saídos (Ponto 11)
- [ ] Lógica de caixas/partes funciona end-to-end (Ponto 12)

---

## Ordem de Implementação Sugerida

1. **Fase 1** - Filtro "Com Encomendas" (impacto imediato, fácil)
2. **Fase 2** - Pesquisa por encomenda nas saídas (melhora operação diária)
3. **Fase 3** - Relatórios detalhados (visibilidade completa)
4. **Fase 4** - Validação de consistência (qualidade de dados)

Tempo estimado: 3-4 sessões de implementação
