

# Plano: Adicionar Virtualização à Lista de Produtos

## Problema Identificado

A tabela de produtos renderiza todos os ~489 produtos de uma vez através de `filteredProducts.map()` (linha 836), criando ~489 elementos DOM simultaneamente. Isto causa:
- Lentidão ao filtrar/pesquisar
- Consumo elevado de memória
- Re-renders pesados

## Solução: Virtualização com @tanstack/react-virtual

A virtualização renderiza apenas as linhas visíveis no ecrã (~15-20 linhas), mantendo a performance mesmo com milhares de itens.

| Antes | Depois |
|-------|--------|
| 489 elementos DOM | ~20 elementos DOM |
| Re-render de todos os itens | Re-render apenas do visível |
| Scroll pesado | Scroll fluido |

## Implementação

### Passo 1: Instalar Dependência

```bash
npm install @tanstack/react-virtual
```

### Passo 2: Reestruturar a Tabela

O componente `<Table>` actual não é ideal para virtualização. A solução é:
1. Manter o `<TableHeader>` fixo
2. Criar um container scrollable com altura fixa para o body
3. Usar `useVirtualizer` para calcular quais linhas mostrar

### Passo 3: Implementar Virtualização

```typescript
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';

// Dentro do componente:
const parentRef = useRef<HTMLDivElement>(null);

const rowVirtualizer = useVirtualizer({
  count: filteredProducts.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 60, // altura estimada de cada linha
  overscan: 5, // renderizar 5 linhas extra acima/abaixo
});

const virtualRows = rowVirtualizer.getVirtualItems();
const totalSize = rowVirtualizer.getTotalSize();
```

### Estrutura HTML Resultante

```jsx
<div className="overflow-x-auto">
  {/* Header fixo */}
  <Table className="table-fixed">
    <TableHeader>...</TableHeader>
  </Table>
  
  {/* Body virtualizado */}
  <div 
    ref={parentRef}
    className="h-[600px] overflow-y-auto" // altura fixa
  >
    <div style={{ height: totalSize, position: 'relative' }}>
      {virtualRows.map((virtualRow) => {
        const product = filteredProducts[virtualRow.index];
        return (
          <div
            key={product.id}
            style={{
              position: 'absolute',
              top: virtualRow.start,
              width: '100%',
            }}
          >
            {/* Conteúdo da linha */}
          </div>
        );
      })}
    </div>
  </div>
</div>
```

## Ficheiros a Modificar

| Ficheiro | Alteração |
|----------|-----------|
| `package.json` | Adicionar `@tanstack/react-virtual` |
| `src/components/products/ProductsView.tsx` | Implementar virtualização na tabela |

## Considerações Técnicas

### Desafio: Tabela vs Div

O componente `<Table>` do shadcn/ui usa elementos HTML semânticos (`<table>`, `<tr>`, `<td>`). A virtualização funciona melhor com `<div>`, então teremos duas opções:

**Opção A: Converter para Divs (Recomendado)**
- Usar divs com `display: grid` para simular colunas
- Melhor performance e compatibilidade com virtualização
- Mantém alinhamento de colunas

**Opção B: Tabela com Body Virtualizado**
- Manter estrutura semântica
- Mais complexo de implementar
- Pode ter problemas de alinhamento

### Altura do Container

O container scrollable terá altura fixa (`h-[600px]`). Isto pode ser ajustado para:
- `calc(100vh - 300px)` para ocupar espaço disponível
- Altura dinâmica baseada no tamanho da janela

### Impacto na Funcionalidade Existente

- **Checkbox "selecionar todos"**: Continua funcional
- **Ordenação**: Continua funcional (ordena dados, não DOM)
- **Filtros**: Continua funcional
- **Resize de colunas**: Pode precisar de ajustes no `ResizableTableProvider`

## Resultado Esperado

| Métrica | Antes | Depois |
|---------|-------|--------|
| Elementos DOM | ~489 linhas | ~20 linhas |
| Tempo de render | ~300ms | ~20ms |
| Memória | Alta | Baixa |
| Scroll FPS | ~30 | ~60 |

