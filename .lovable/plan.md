
# Plano: Unificar Sistema de Stock - Movimentos Afectam Counts

## Problema Diagnosticado

O sistema actualmente tem **dois mecanismos conflituantes** de gestão de stock:

### Arquitectura Actual (Problemática)

```text
┌─────────────────────────────────────────────────────────────────┐
│                    SISTEMA ACTUAL                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [Contagem]                    [Entradas/Saídas]               │
│      │                              │                           │
│      ▼                              ▼                           │
│  ┌─────────┐                  ┌──────────────────┐             │
│  │ counts  │──trigger──►      │ stock_movements  │             │
│  └────┬────┘           │      └────────┬─────────┘             │
│       │                │               │                        │
│       │          sync_product_stock    │ (tenta atualizar)     │
│       │                │               │                        │
│       ▼                ▼               ▼                        │
│  ┌─────────────────────────────────────────┐                   │
│  │     products.current_stock              │                   │
│  │     (SOBRESCRITO pelo trigger!)         │                   │
│  └─────────────────────────────────────────┘                   │
│                                                                 │
│  RESULTADO: Entradas/Saídas são IGNORADAS!                     │
└─────────────────────────────────────────────────────────────────┘
```

### Evidência do Problema (ES5)
- Counts: 5 unidades
- Movimentos: +9 entradas, -6 saídas (net: +3)
- Stock esperado: 5 + 3 = 8 unidades
- Stock actual: 5 unidades (só usa counts!)
- Stock físico: 4 unidades

---

## Solução Proposta

Unificar o sistema fazendo com que **todos os movimentos de stock actualizem a tabela `counts`**, permitindo que o trigger seja a única fonte de verdade.

### Nova Arquitectura

```text
┌─────────────────────────────────────────────────────────────────┐
│                    SISTEMA CORRIGIDO                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [Contagem]                    [Entradas/Saídas]               │
│      │                              │                           │
│      │                              │                           │
│      ▼                              ▼                           │
│  ┌─────────────────────────────────────────┐                   │
│  │              counts                      │                   │
│  │  (ÚNICA fonte de verdade para stock)    │                   │
│  └────────────────────┬────────────────────┘                   │
│                       │                                         │
│               trigger sync_product_stock                        │
│                       │                                         │
│                       ▼                                         │
│  ┌─────────────────────────────────────────┐                   │
│  │     products.current_stock              │                   │
│  │     (Sempre sincronizado!)              │                   │
│  └─────────────────────────────────────────┘                   │
│                                                                 │
│  ┌─────────────────────────────────────────┐                   │
│  │     stock_movements                      │                   │
│  │     (Histórico/Auditoria apenas)        │                   │
│  └─────────────────────────────────────────┘                   │
│                                                                 │
│  RESULTADO: Entradas/Saídas reflectidas no stock!              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Alterações Necessárias

### 1. Modificar `useStockMovements.tsx`

Quando uma entrada/saída é registada, actualizar a tabela `counts` em vez de `products.current_stock`:

**Lógica actual (a remover):**
```typescript
// Linhas 101-117 e 179-184
const { error: updateError } = await supabase
  .from('products')
  .update({ current_stock: newStock })
  .eq('id', productId);
```

**Nova lógica:**
```typescript
// Buscar count existente para o produto (colis 1)
const { data: existingCount } = await supabase
  .from('counts')
  .select('id, quantity, session_id')
  .eq('product_id', productId)
  .eq('colis_number', 1)
  .order('counted_at', { ascending: false })
  .limit(1)
  .maybeSingle();

// Calcular nova quantidade
const currentQty = existingCount?.quantity || 0;
const newQty = type === 'entrada' 
  ? currentQty + quantity 
  : Math.max(0, currentQty - quantity);

// Actualizar ou criar count
if (existingCount) {
  await supabase
    .from('counts')
    .update({ quantity: newQty })
    .eq('id', existingCount.id);
} else {
  // Criar sessão de sistema se não existir
  // Inserir novo count
}
```

### 2. Modificar `useCounting.tsx`

Remover a duplicação de lógica - o incremento/decremento já actualiza `counts`, não precisa também actualizar `products` nem criar `stock_movements`:

**Remover das funções `incrementCount` e `decrementCount`:**
- Linhas 136-159: Atualização manual de `current_stock` e criação de `stock_movement`
- Linhas 189-212: Idem para decrement

O trigger já cuida da sincronização automaticamente!

### 3. Criar Sessão de Sistema para Movimentos

Criar uma sessão "permanente" para agrupar os movimentos administrativos:

```sql
-- Criar sessão de sistema (uma única vez)
INSERT INTO counting_sessions (name, category, status)
VALUES ('Sistema - Movimentos Administrativos', 'Todas', 'active')
ON CONFLICT DO NOTHING;
```

### 4. Limpar Dados Históricos

Remover movimentos duplicados "Contagem - Sessão" que só confundem o histórico:

```sql
-- Remover movimentos redundantes criados pela contagem
DELETE FROM stock_movements 
WHERE reason = 'Contagem - Sessão';
```

### 5. Sincronizar Stock Existente

Ajustar o stock dos produtos que têm movimentos não contabilizados:

```sql
-- Para cada produto, somar os movimentos administrativos (não Contagem)
-- e adicionar ao count existente
```

---

## Ficheiros a Modificar

| Ficheiro | Alteração |
|----------|-----------|
| `src/hooks/useStockMovements.tsx` | Actualizar `counts` em vez de `products.current_stock` |
| `src/hooks/useCounting.tsx` | Remover actualização manual de stock e criação de movements |
| Migração SQL | Limpar dados e criar sessão de sistema |

---

## Resultado Esperado

Após implementação:

1. **Entradas manuais** → Incrementam `counts` → Trigger sincroniza `current_stock`
2. **Saídas manuais** → Decrementam `counts` → Trigger sincroniza `current_stock`
3. **Incrementos na contagem** → Incrementam `counts` → Trigger sincroniza (sem duplicar movements)
4. **Decrementos na contagem** → Decrementam `counts` → Trigger sincroniza (sem duplicar movements)
5. **stock_movements** → Registo de auditoria apenas, sem afectar stock

### Cálculo Correto do ES5:
- Counts actuais: 5
- Movimentos administrativos: +4 (Compra) - 2 (Vendas) = +2
- Novo counts: 5 + 2 = 7
- Ajuste para realidade física (4): necessário corrigir manualmente para 4

---

## Ordem de Implementação

1. Migração DB: Criar sessão de sistema e limpar movements duplicados
2. Modificar `useCounting.tsx`: Remover duplicação de lógica
3. Modificar `useStockMovements.tsx`: Actualizar counts em vez de products
4. Sincronizar dados existentes
5. Testar fluxo completo
