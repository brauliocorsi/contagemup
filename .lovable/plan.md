
# Correcção do Bug: Não Consegue Adicionar Colis na Contagem

## Problema Identificado

Ao clicar no botão "+" para adicionar unidades ao produto "teste", o sistema cria **registos duplicados** em vez de actualizar o registo existente. Isto causa:

1. **22 registos duplicados** para o mesmo coli (colis_number: 1)
2. Cada registo com quantity: 1
3. O stock aparece como 8 (soma dos registos) mas a contagem visual mostra incorrectamente

**Causa Raiz**: Race condition no código

```text
1. Utilizador clica em "+" rapidamente
2. incrementCount() verifica lista local counts (em cache)
3. Como a cache ainda não actualizou, cada clique pensa que não existe count
4. Resultado: múltiplos INSERTs em vez de UPDATEs
```

---

## Solução: Múltiplas Correcções

### Correcção 1: Usar UPSERT em vez de INSERT/UPDATE

Modificar `updateCount` para usar `upsert` com constraint única na base de dados, evitando duplicados.

### Correcção 2: Protecção contra cliques rápidos (debounce)

Adicionar estado de "a processar" para bloquear cliques múltiplos enquanto a operação anterior não terminou.

### Correcção 3: Adicionar constraint única na BD (recomendado)

Criar uma constraint ou índice único para prevenir duplicados a nível de base de dados:
- `(product_id, colis_number, session_id)` deve ser único
- Usar `ON CONFLICT` para fazer update automático

### Correcção 4: Limpar dados corrompidos

Criar script para consolidar os 22 registos duplicados num único registo correcto.

---

## Ficheiros a Modificar

| Ficheiro | Alteração |
|----------|-----------|
| `src/hooks/useCounting.tsx` | Usar UPSERT + estado de loading por operação |
| `Migração SQL` | Adicionar constraint única e limpar duplicados |

---

## Detalhes Técnicos

### Alteração no useCounting.tsx

```typescript
// Adicionar estado para prevenir cliques rápidos
const [pendingOperations, setPendingOperations] = useState<Set<string>>(new Set());

const incrementCount = async (productId: string, colisNumber: number) => {
  const operationKey = `${productId}-${colisNumber}`;
  
  // Prevenir cliques rápidos
  if (pendingOperations.has(operationKey)) {
    return false;
  }
  
  setPendingOperations(prev => new Set(prev).add(operationKey));
  
  try {
    // Usar busca directa na BD para evitar stale cache
    const { data: freshCount } = await supabase
      .from('counts')
      .select('id, quantity')
      .eq('product_id', productId)
      .eq('colis_number', colisNumber)
      .eq('session_id', sessionId)
      .maybeSingle();
    
    const oldQuantity = freshCount?.quantity || 0;
    const newQuantity = oldQuantity + 1;
    
    if (freshCount) {
      // UPDATE existente
      await supabase
        .from('counts')
        .update({ quantity: newQuantity, counted_by: user.id })
        .eq('id', freshCount.id);
    } else {
      // INSERT novo
      await supabase
        .from('counts')
        .insert({
          session_id: sessionId,
          product_id: productId,
          colis_number: colisNumber,
          quantity: 1,
          counted_by: user.id
        });
    }
    
    invalidateCounts();
    return true;
  } finally {
    setPendingOperations(prev => {
      const next = new Set(prev);
      next.delete(operationKey);
      return next;
    });
  }
};
```

### Migração SQL

```sql
-- 1. Consolidar duplicados (manter maior quantidade por combinação)
WITH duplicates AS (
  SELECT product_id, colis_number, session_id, 
         SUM(quantity) as total_qty,
         MIN(id) as keep_id
  FROM counts
  GROUP BY product_id, colis_number, session_id
  HAVING COUNT(*) > 1
)
UPDATE counts c
SET quantity = d.total_qty
FROM duplicates d
WHERE c.id = d.keep_id;

-- 2. Remover registos duplicados (manter apenas o primeiro)
DELETE FROM counts
WHERE id NOT IN (
  SELECT MIN(id)
  FROM counts
  GROUP BY product_id, colis_number, session_id
);

-- 3. Criar índice único para prevenir futuros duplicados
CREATE UNIQUE INDEX IF NOT EXISTS idx_counts_unique_product_colis_session 
ON counts (product_id, colis_number, COALESCE(session_id, '00000000-0000-0000-0000-000000000000'));
```

---

## Fluxo de Correcção

```text
┌──────────────────────┐
│   Utilizador clica + │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  Operação pendente?  │──── Sim ──▶ Ignorar clique
└──────────┬───────────┘
           │ Não
           ▼
┌──────────────────────┐
│  Marcar como pendente│
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  Buscar count fresco │
│  (directo da BD)     │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  Existe registo?     │──── Não ──▶ INSERT novo
└──────────┬───────────┘
           │ Sim
           ▼
┌──────────────────────┐
│  UPDATE quantidade   │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  Limpar pendente     │
│  Invalidar cache     │
└──────────────────────┘
```

---

## Resultado Esperado

- Clicar em "+" incrementa correctamente a quantidade
- Clicar rapidamente não cria duplicados
- Dados corrompidos são limpos
- Sistema fica mais robusto para o futuro
