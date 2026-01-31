

# Plano de Correção: Cards Sobrepostos na Contagem

## Resumo do Problema

Os cards de produto na aba "Contagem" estão a ficar sobrepostos porque o virtualizer (@tanstack/react-virtual) não consegue medir correctamente a altura de cada linha.

**Causa raiz identificada nos logs da consola:**
```
Missing attribute name 'data-index={index}' on measured element.
```

O `measureElement` precisa do atributo `data-index` no elemento para saber a que linha corresponde a medição. Sem isso, as alturas não são aplicadas correctamente.

---

## Solução Proposta

### Alteração 1: Adicionar `data-index` ao container de cada linha virtual

No ficheiro `src/components/counting/CountingProductList.tsx`, adicionar o atributo `data-index={virtualRow.index}` ao div que recebe o `ref={rowVirtualizer.measureElement}`.

**De:**
```tsx
<div
  key={virtualRow.key}
  ref={rowVirtualizer.measureElement}
  className="pb-6"
  style={{...}}
>
```

**Para:**
```tsx
<div
  key={virtualRow.key}
  data-index={virtualRow.index}
  ref={rowVirtualizer.measureElement}
  className="pb-4"
  style={{...}}
>
```

### Alteração 2: Ajustar espaçamento (modo compacto conforme pedido)

- Reduzir `pb-6` para `pb-4` (espaçamento entre linhas)
- Reduzir `gap-6` para `gap-4` (espaçamento entre colunas)

---

## Ficheiros a Modificar

| Ficheiro | Alteração |
|----------|-----------|
| `src/components/counting/CountingProductList.tsx` | Adicionar `data-index` e ajustar espaçamento |

---

## Detalhes Técnicos

O TanStack Virtual utiliza `measureElement` para medir dinamicamente a altura de cada linha. Esta função depende do atributo `data-index` para mapear o elemento DOM ao índice virtual correcto. Sem este atributo:

1. A medição falha silenciosamente (warning na consola)
2. O virtualizer usa apenas o `estimateSize` (300px fixo)
3. Quando cards reais têm alturas diferentes, as posições `transform: translateY()` ficam erradas
4. Resultado: sobreposição visual dos cards

Com a correcção, cada linha terá a sua altura real medida e aplicada, eliminando a sobreposição.

---

## Resultado Esperado

- Os cards deixam de se sobrepor ao fazer scroll
- Cada linha ocupa exactamente o espaço necessário
- Layout mais compacto conforme preferido
- Funciona correctamente em desktop (onde o problema era mais visível)

