# Plano: Números de Encomenda - IMPLEMENTADO ✓

## Resumo

A funcionalidade de **números de encomenda por unidade** foi integrada nos seguintes locais:

## Alterações Implementadas

### 1. Base de Dados (Supabase)
- ✅ Adicionado campo `requires_order_number` (boolean) à tabela `categories`
- ✅ Criada tabela `stock_order_numbers` para rastrear encomendas em stock

### 2. Contagem (ProductCard)
- ✅ Passada prop `requiresOrderNumber` do CountingView para ProductCard
- ✅ Badge visual "Nº Encomenda" quando categoria exige
- ✅ Interface `OrderNumberEntrySelector` em vez de botões +/- quando exigido

### 3. Entradas de Stock (ManualStockSection)
- ✅ Detecta categoria com `requires_order_number`
- ✅ Mostra botão de encomenda em vez de quantidade normal
- ✅ Linha expandida com `OrderNumberEntrySelector`

### 4. Saídas de Stock (ManualStockSection)
- ✅ Detecta categoria com `requires_order_number`
- ✅ Linha expandida com `OrderNumberExitSelector`
- ✅ Adiciona ao carrinho com referência à encomenda

## Ficheiros Modificados

| Ficheiro | Alteração |
|----------|-----------|
| `src/hooks/useCategories.tsx` | Campo `requires_order_number` |
| `src/hooks/useOrderNumbers.tsx` | NOVO - hook para gestão de encomendas |
| `src/hooks/useStockMovements.tsx` | Campo `orderNumber` em MovementItem |
| `src/components/categories/CategoriesView.tsx` | Checkbox para activar exigência |
| `src/components/counting/CountingView.tsx` | Mapa de categorias, passa prop |
| `src/components/counting/ProductCard.tsx` | Interface especial, badge |
| `src/components/stock/ManualStockSection.tsx` | Detecta categoria, mostra selectores |
| `src/components/stock/OrderNumberSelector.tsx` | NOVO - Entry e Exit selectors |
| `src/types/stock.ts` | Interface `OrderNumberEntry` |

## Como Usar

1. **Configurar Categoria**: 
   - Ir a "Categorias"
   - Editar ou criar categoria
   - Marcar "Exigir número de encomenda por unidade"

2. **Na Contagem/Entradas**:
   - Produtos da categoria mostram interface especial
   - Introduzir número de encomenda
   - Sistema regista em `stock_order_numbers` e incrementa counts

3. **Nas Saídas**:
   - Produtos da categoria mostram lista de encomendas disponíveis
   - Seleccionar encomenda completa
   - Sistema remove de `stock_order_numbers` e decrementa counts
