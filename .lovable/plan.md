
# Visualização Completa do Nome do Produto na Seleção de Stock

## Problema Identificado

Na tabela de seleção de produtos (entradas e saídas de stock), o nome do produto é cortado devido a:

```tsx
// Linha 318 - ManualStockSection.tsx
<TableCell className="max-w-[200px]">
  <span className="truncate block" title={product.name}>
    {product.name}
  </span>
</TableCell>
```

| Problema | Impacto |
|----------|---------|
| `max-w-[200px]` | Limita largura máxima da célula |
| `truncate` | Corta texto com "..." |
| Layout fixo | Não adapta bem a tablet/mobile |

---

## Solução Proposta

### Abordagem: Layout Responsivo com Wrap do Texto

Em vez de cortar o nome, vamos:
1. **Remover o truncate** - Permitir que o nome quebre em múltiplas linhas
2. **Ajustar larguras das colunas** - Dar mais espaço ao nome, comprimir outras
3. **Layout diferente para mobile** - Em ecrãs pequenos, usar layout de cartões ou empilhado

---

## Alterações Técnicas

### Ficheiro: `src/components/stock/ManualStockSection.tsx`

#### 1. Remover Truncate e Limites de Largura

**Antes:**
```tsx
<TableCell className="max-w-[200px]">
  <span className="truncate block" title={product.name}>
    {product.name}
  </span>
</TableCell>
```

**Depois:**
```tsx
<TableCell>
  <div className="flex flex-col gap-0.5">
    <span className="text-sm leading-tight break-words">
      {product.name}
    </span>
    {/* badges... */}
  </div>
</TableCell>
```

#### 2. Optimizar Larguras das Colunas

**Antes:**
```tsx
<TableHead className="w-[120px]">Código</TableHead>
<TableHead>Nome</TableHead>
<TableHead className="w-[80px] text-center">Stock</TableHead>
<TableHead className="w-[80px] text-center">Colis</TableHead>
<TableHead className="w-[180px] text-right">Quantidade</TableHead>
<TableHead className="w-[60px]"></TableHead>
```

**Depois (responsivo):**
```tsx
<TableHead className="w-[100px] md:w-[120px]">Código</TableHead>
<TableHead className="min-w-[180px]">Nome</TableHead>
<TableHead className="w-[60px] md:w-[80px] text-center">Stock</TableHead>
<TableHead className="w-[50px] md:w-[80px] text-center hidden sm:table-cell">Colis</TableHead>
<TableHead className="w-[120px] md:w-[180px] text-right">Qtd.</TableHead>
<TableHead className="w-[50px] md:w-[60px]"></TableHead>
```

#### 3. Usar `whitespace-normal` e `break-words`

Para garantir que o nome quebra correctamente em múltiplas linhas:

```tsx
<TableCell className="py-2">
  <div className="flex flex-col gap-0.5">
    <span className="text-sm leading-snug whitespace-normal break-words">
      {product.name}
    </span>
    {/* resto do conteúdo */}
  </div>
</TableCell>
```

#### 4. Adicionar Scroll Horizontal no Container

Para tablets, permitir scroll horizontal se necessário:

```tsx
<div className="border rounded-lg overflow-x-auto">
  <ScrollArea className="h-[400px]">
    <Table className="min-w-[600px]">
      {/* ... */}
    </Table>
  </ScrollArea>
</div>
```

---

## Comparação Visual

| Antes | Depois |
|-------|--------|
| "CAMA ARTICULAD..." | "CAMA ARTICULADA ELÉTRICA COM CABECEIRA EM MADEIRA" |
| Nome cortado | Nome completo em 2-3 linhas |
| Linhas compactas | Linhas mais altas mas legíveis |

---

## Comportamento por Dispositivo

| Dispositivo | Comportamento |
|-------------|---------------|
| **Desktop** | Tabela normal, nome em 1-2 linhas |
| **Tablet** | Nome pode ocupar 2-3 linhas, colunas comprimidas |
| **Mobile** | Scroll horizontal disponível, nomes visíveis |

---

## Ficheiros a Modificar

| Ficheiro | Alteração |
|----------|-----------|
| `src/components/stock/ManualStockSection.tsx` | Remover truncate, ajustar larguras, permitir wrap do texto |

---

## Resultado Esperado

1. Nome completo visível sem precisar de hover
2. Layout adapta-se a diferentes tamanhos de ecrã
3. Linhas da tabela mais altas mas totalmente legíveis
4. Mantém funcionalidade de scroll se necessário
