
# Correção da Inconsistência na Divisão/Unificação de Stock

## Problema Identificado

Quando um produto tem registos de contagem em **duas fontes** diferentes:
1. **Sessão actual** (`session_id = 'ae7b31b4...'`)
2. **Administrativos** (`session_id IS NULL`)

As funções de **Unificar** e **Dividir** causam duplicação de quantidade porque:

| Etapa | O que acontece | Problema |
|-------|----------------|----------|
| 1. Leitura | Soma quantidades de AMBAS fontes | Inclui registos administrativos |
| 2. Apagar | Apaga apenas registos da sessão | Deixa os administrativos intactos |
| 3. Inserir | Cria novo registo com a soma total | Quantidade duplicada |

### Exemplo com produto 017817F (Coli 2):
- Registo sessão: 1 un. em C2/PLT052
- Registo admin: 0 un. em B3
- **Ao unificar**: soma = 1, apaga só sessão, insere 1 → admin fica → total vira 1+0 = OK neste caso, mas...
- **Se admin tivesse quantidade**: soma = 1+X, apaga sessão, insere 1+X → admin fica com X → total = 1+X+X

---

## Solução

### Abordagem Escolhida: Unificar Ambas Fontes

Quando se divide ou unifica stock, o sistema deve:
1. **Apagar TODOS os registos** do coli (sessão E administrativos)
2. **Inserir novos registos** apenas com `session_id` da sessão actual

Isto garante que não há "fantasmas" administrativos a interferir.

---

## Alterações Técnicas

### Ficheiro: `src/hooks/useCounting.tsx`

#### 1. Função `splitColisStock` (linhas ~705-753)

**Antes:**
```typescript
const { error: deleteError } = await supabase
  .from('counts')
  .delete()
  .eq('session_id', sessionId)  // Só apaga sessão!
  .eq('product_id', productId)
  .eq('colis_number', colisNumber);
```

**Depois:**
```typescript
// Apagar TODOS os registos deste coli (sessão + administrativos)
const { error: deleteError } = await supabase
  .from('counts')
  .delete()
  .eq('product_id', productId)
  .eq('colis_number', colisNumber)
  .or(`session_id.eq.${sessionId},session_id.is.null`);
```

#### 2. Função `mergeColisStock` (linhas ~757-810)

**Antes:**
```typescript
// Filtra do cache (inclui admin)
const existingCounts = counts.filter(
  c => c.product_id === productId && c.colis_number === colisNumber
);
const totalQuantity = existingCounts.reduce(...);

// Apaga só sessão
const { error: deleteError } = await supabase
  .from('counts')
  .delete()
  .eq('session_id', sessionId)
  ...
```

**Depois:**
```typescript
// Buscar directamente da BD para ter dados frescos
const { data: freshCounts } = await supabase
  .from('counts')
  .select('id, quantity, session_id')
  .eq('product_id', productId)
  .eq('colis_number', colisNumber)
  .or(`session_id.eq.${sessionId},session_id.is.null`);

const totalQuantity = (freshCounts || []).reduce(
  (sum, c) => sum + (c.quantity || 0), 0
);

// Apagar TODOS (sessão + admin)
const { error: deleteError } = await supabase
  .from('counts')
  .delete()
  .eq('product_id', productId)
  .eq('colis_number', colisNumber)
  .or(`session_id.eq.${sessionId},session_id.is.null`);
```

---

## Validação Adicional

### Prevenir Race Conditions

Adicionar um guard de operação em progresso para evitar cliques duplos durante split/merge:

```typescript
const handleMergeStock = async (colisNumber: number) => {
  const operationKey = `merge-${product.id}-${colisNumber}`;
  if (pendingOperationsRef.current.has(operationKey)) return;
  pendingOperationsRef.current.add(operationKey);
  
  try {
    await onMergeStock(...);
  } finally {
    pendingOperationsRef.current.delete(operationKey);
  }
};
```

---

## Ficheiros a Modificar

| Ficheiro | Alteração |
|----------|-----------|
| `src/hooks/useCounting.tsx` | Corrigir `splitColisStock` e `mergeColisStock` para apagar ambas fontes |

---

## Resultado Esperado

1. **Dividir**: Apaga todos os registos do coli e cria novos com a distribuição correcta
2. **Unificar**: Soma todas as quantidades, apaga todos os registos, cria um único com o total
3. **Consistência**: Não haverá mais registos "órfãos" a causar duplicação de quantidade
