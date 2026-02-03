

# Guard para Cliques Duplos e Subtração Automática na Divisão de Stock

## Resumo

Adicionar duas melhorias ao sistema de divisão de stock:
1. **Guard de cliques duplos** - Prevenir operações duplicadas nos botões Split e Merge
2. **Subtração automática** - Ao editar uma quantidade na distribuição, automaticamente ajustar as outras para manter o total

---

## Parte 1: Guard de Cliques Duplos no ProductCard

### Problema Actual
Os botões de "Dividir" e "Unificar" podem ser clicados múltiplas vezes rapidamente antes da operação terminar, causando comportamento inconsistente.

### Solução
Usar um `useRef` para rastrear operações em progresso e desabilitar os botões durante a execução.

### Implementação

```typescript
// No ProductCard
const [pendingOperations, setPendingOperations] = useState<Set<string>>(new Set());

const openSplitDialog = (colisNumber: number) => {
  const key = `split-${product.id}-${colisNumber}`;
  if (pendingOperations.has(key)) return;
  
  const detail = getColisDetail(colisNumber);
  if (detail) {
    setSelectedColisForSplit(detail);
    setSplitDialogOpen(true);
  }
};

const handleMergeStock = async (colisNumber: number) => {
  const key = `merge-${product.id}-${colisNumber}`;
  if (pendingOperations.has(key) || !onMergeStock) return;
  
  setPendingOperations(prev => new Set(prev).add(key));
  
  try {
    const detail = getColisDetail(colisNumber);
    if (detail) {
      await onMergeStock(product.id, colisNumber, detail.location || '', detail.pallet_number || '');
    }
  } finally {
    setPendingOperations(prev => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }
};
```

### Alteração Visual
Os botões mostrarão um indicador de loading e ficarão desabilitados durante a operação.

---

## Parte 2: Subtração Automática no SplitStockDialog

### Comportamento Desejado
Quando o utilizador tem 2 ou mais localizações de distribuição e edita uma quantidade, o sistema deve automaticamente ajustar as outras para manter o total correcto.

### Regras de Subtração

| Cenário | Comportamento |
|---------|---------------|
| 2 localizações | Editar uma → subtrair da outra |
| 3+ localizações | Editar uma → subtrair da última localização |
| Valor > Total | Mostrar aviso, permitir (adiciona stock) |
| Último campo zerado | Não criar campo negativo |

### Exemplo Prático

```
Total: 10 unidades

Localização 1: [5]  ← Utilizador muda para 7
Localização 2: [5]  ← Automaticamente ajusta para 3

Resultado:
Localização 1: [7]
Localização 2: [3]
Total: 10 ✓
```

### Implementação

```typescript
const updateDistribution = (id: string, field: keyof StockDistribution, value: string | number) => {
  if (field === 'quantity' && typeof value === 'number') {
    setDistributions(prev => {
      const idx = prev.findIndex(d => d.id === id);
      if (idx === -1) return prev;
      
      const oldValue = prev[idx].quantity;
      const diff = value - oldValue;
      
      // Se não há diferença ou só há 1 distribuição, apenas actualizar
      if (diff === 0 || prev.length === 1) {
        return prev.map(d => d.id === id ? { ...d, quantity: value } : d);
      }
      
      // Encontrar o campo para subtrair (preferir o próximo, ou o primeiro se for o último)
      const targetIdx = idx === prev.length - 1 ? 0 : prev.length - 1;
      
      // Se o target não é o mesmo que estamos a editar
      if (targetIdx !== idx) {
        const targetNewValue = Math.max(0, prev[targetIdx].quantity - diff);
        
        return prev.map((d, i) => {
          if (i === idx) return { ...d, quantity: value };
          if (i === targetIdx) return { ...d, quantity: targetNewValue };
          return d;
        });
      }
      
      return prev.map(d => d.id === id ? { ...d, quantity: value } : d);
    });
  } else {
    setDistributions(prev =>
      prev.map(d => d.id === id ? { ...d, [field]: value } : d)
    );
  }
};
```

### Comportamento com Nova Localização
Quando o utilizador adiciona uma nova localização (inicia com 0), ao preencher o valor:
- A quantidade é subtraída da última localização existente com stock > 0
- Isto mantém o total consistente sem alterar o total geral

---

## Ficheiros a Modificar

| Ficheiro | Alteração |
|----------|-----------|
| `src/components/counting/ProductCard.tsx` | Adicionar estado `pendingOperations` e guards nos handlers |
| `src/components/counting/SplitStockDialog.tsx` | Modificar `updateDistribution` para subtração automática |

---

## Detalhes Técnicos

### ProductCard.tsx

**Adicionar estado:**
```typescript
const [pendingOperations, setPendingOperations] = useState<Set<string>>(new Set());
```

**Modificar `handleMergeStock`:**
- Adicionar verificação de operação pendente
- Envolver em try/finally para limpar estado
- Desabilitar botão com `disabled={pendingOperations.has(...)}`

### SplitStockDialog.tsx

**Modificar `updateDistribution`:**
- Detectar quando `field === 'quantity'`
- Calcular diferença entre valor antigo e novo
- Distribuir a diferença para outro campo automaticamente
- Garantir que nenhum campo fica negativo (mínimo 0)

---

## Resultado Esperado

1. **Cliques duplos prevenidos** - Botões de Split/Merge ficam desabilitados durante operações
2. **Subtração inteligente** - Editar um campo ajusta automaticamente o outro
3. **Experiência fluída** - Utilizador pode rapidamente redistribuir quantidades
4. **Consistência** - Total mantém-se correcto automaticamente

