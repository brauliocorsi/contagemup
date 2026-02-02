
# Correcção: Dashboard/Contagem Mostra Números Diferentes da Gestão de Produtos

## Problema Identificado

O resumo da contagem mostra valores de "Sets Completos" diferentes do `current_stock` mostrado na gestão de produtos.

**Dados na BD (correctos):**
- Produto "teste" (t-12): current_stock = 18, Coli 1 = 18, Coli 2 = 18

**Comportamento actual:**
- **Gestão de Produtos**: Mostra `product.current_stock` da tabela products (16 ou outro valor em cache)
- **Resumo da Contagem**: Calcula `completeSets` = MIN(coli1, coli2) a partir dos counts carregados (20 ou outro valor em cache)

```text
┌─────────────────────────────────────────────────────────────────┐
│  PROBLEMA: DUAS FONTES DE DADOS DIFERENTES                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  CountingSummary.tsx (linha 15):                                │
│  ├─ totalCompleteSets = SUM(p.completeSets)                     │
│  └─ completeSets vem de useCounting → getProductWithCounts()   │
│      └─ MIN(quantidades de cada coli) dos COUNTS em cache      │
│                                                                 │
│  ProductsView.tsx:                                              │
│  └─ Mostra product.current_stock da tabela PRODUCTS em cache   │
│                                                                 │
│  PROBLEMA: Os caches têm staleTime diferentes:                  │
│  ├─ counts: 5 segundos                                          │
│  ├─ products: 2 segundos                                        │
│  └─ last-counts: 2 MINUTOS (!)                                  │
│                                                                 │
│  E NÃO INVALIDAM SINCRONIZADAMENTE!                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Causa Raiz

Há **três problemas**:

1. **Caches dessincronizados**: Quando um count muda, o sistema:
   - Invalida `['counts', sessionId]` ✓
   - Espera que o trigger BD actualize `products.current_stock`
   - Espera que o realtime invalide `['products']`
   - **NÃO invalida** `['last-counts']` explicitamente!

2. **staleTime muito longo em last-counts**: 2 minutos vs 2-5 segundos dos outros

3. **CountingSummary usa completeSets em vez de current_stock**: O resumo deveria usar `current_stock` para ser consistente com a gestão de produtos

---

## Solução

### Passo 1: Invalidar todos os caches relacionados após mudanças de contagem

Quando um count é modificado, invalidar também:
- `['products']` - para actualizar current_stock
- `['last-counts']` - para actualizar a visualização

**Ficheiro**: `src/hooks/useCounting.tsx`

```typescript
// Na função invalidateCounts (linha ~92)
const invalidateCounts = useCallback(() => {
  queryClient.invalidateQueries({ queryKey: ['counts', sessionId] });
  queryClient.invalidateQueries({ queryKey: ['products'] });
  queryClient.invalidateQueries({ queryKey: ['last-counts'] });
}, [queryClient, sessionId]);
```

### Passo 2: Reduzir staleTime de last-counts

**Ficheiro**: `src/hooks/useLastCounts.tsx`

```typescript
// Linha 210 - reduzir de 2 minutos para 5 segundos
staleTime: 5000, // 5 segundos em vez de 2 minutos
```

### Passo 3: Usar current_stock no CountingSummary (opcional)

Para garantir consistência, o resumo pode usar `current_stock` directamente:

**Ficheiro**: `src/components/counting/CountingSummary.tsx`

```typescript
// Linha 15 - usar current_stock em vez de completeSets calculado
const totalCompleteSets = products.reduce((sum, p) => sum + p.current_stock, 0);
```

**Nota**: Esta alteração é opcional se os passos 1 e 2 forem implementados, pois os valores devem ficar sincronizados.

---

## Ficheiros a Modificar

| Ficheiro | Alteração |
|----------|-----------|
| `src/hooks/useCounting.tsx` | Invalidar `['products']` e `['last-counts']` após mudanças |
| `src/hooks/useLastCounts.tsx` | Reduzir staleTime de 2min para 5s |
| `src/components/counting/CountingSummary.tsx` | (Opcional) Usar `current_stock` em vez de `completeSets` |

---

## Resultado Esperado

Após a correcção:
- Todos os valores de stock ficam sincronizados entre todas as views
- Quando um count muda, todas as views actualizam imediatamente
- "Sets Completos" no resumo = soma de `current_stock` de todos os produtos
- Não há mais discrepâncias entre Contagem e Gestão de Produtos
