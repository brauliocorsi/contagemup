
# Plano: Corrigir Badge "1 Incompleto" para Mostrar Partes Excedentes

## Problema Identificado

O badge "1 Incompleto" é confuso quando o stock é 0. O utilizador espera ver:
- **Stock = 0** → Nenhum produto completo disponível
- **Badge** → Indicação clara das partes sobrando

### Situação Actual (Cama Alice):
| Coli | Nome | Quantidade |
|------|------|------------|
| 1 | Cabeceira | 3 |
| 2 | Ilhargueiro | 0 |

**Resultado:**
- `completeSets = MIN(3, 0) = 0` ✓
- `hasPartialProduct = MAX(3,0) > 0 = true` ✓
- Badge mostra: "1 Incompleto" ❌ (confuso!)

### O Que Deveria Mostrar:
- "3 Partes Soltas" ou "3 Colis Excedentes"
- Indicação de quais colis estão em excesso

## Solução Proposta

Alterar o badge de "1 Incompleto" para mostrar o **número real de partes excedentes**:

### Lógica:
```typescript
// Calcular total de partes excedentes
const totalExcessParts = maxQuantity - completeSets;

// Badge mostra quantidade real
{product.hasPartialProduct && (
  <Badge className="bg-yellow-100 text-yellow-800">
    {totalExcessParts} Parte{totalExcessParts > 1 ? 's' : ''} Solta{totalExcessParts > 1 ? 's' : ''}
  </Badge>
)}
```

### Exemplo Visual:
| Antes | Depois |
|-------|--------|
| "1 Incompleto" | "3 Partes Soltas" |
| Confuso para utilizador | Claro e preciso |

## Ficheiros a Modificar

| Ficheiro | Alteração |
|----------|-----------|
| `src/components/counting/ProductCard.tsx` | Alterar badge de "1 Incompleto" para mostrar partes excedentes reais |
| `src/types/stock.ts` | (Opcional) Adicionar campo `totalExcessParts` a `ProductWithCounts` |
| `src/hooks/useCounting.tsx` | Calcular e expor `totalExcessParts` |

## Secção Técnica

### Alteração em `useCounting.tsx`:
```typescript
// Adicionar após linha 461
const totalExcessParts = maxQuantity - completeSets;

// Incluir no return (linha 499)
return {
  ...product,
  // ... campos existentes
  totalExcessParts, // NOVO
};
```

### Alteração em `ProductCard.tsx` (linhas 404-408):
```typescript
// De:
{product.hasPartialProduct && (
  <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
    1 Incompleto
  </Badge>
)}

// Para:
{product.hasPartialProduct && product.excessColis.length > 0 && (
  <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
    {product.excessColis.reduce((sum, c) => sum + c.excess, 0)} Parte{product.excessColis.reduce((sum, c) => sum + c.excess, 0) > 1 ? 's' : ''} Solta{product.excessColis.reduce((sum, c) => sum + c.excess, 0) > 1 ? 's' : ''}
  </Badge>
)}
```

### Resultado Esperado:
Para a Cama Alice com 3 Cabeceiras e 0 Ilhargueiros:
- Stock: 0 ✓
- Badge: "3 Partes Soltas" ✓
- Mensagem: "Para +1: Falta: 3x Ilhargueiro" ✓
