# Plano: Números de Encomenda por Unidade em Categorias Específicas

## Estado de Implementação

### ✅ Concluído

1. **Base de Dados**
   - [x] Campo `requires_order_number` adicionado à tabela `categories`
   - [x] Tabela `stock_order_numbers` criada com RLS policies

2. **Hook de Categorias**
   - [x] Interface `Category` actualizada com `requires_order_number`
   - [x] Funções `createCategory` e `updateCategory` actualizadas

3. **Interface de Categorias**
   - [x] Checkbox "Exigir número de encomenda por unidade" nos diálogos de criar/editar
   - [x] Badge visual na tabela para categorias que exigem número de encomenda

4. **Hook de Números de Encomenda**
   - [x] `src/hooks/useOrderNumbers.tsx` criado
   - [x] Funções: addOrderNumber, updateColisStatus, verifyOrderNumber, deleteOrderNumber

5. **Tipos**
   - [x] `OrderNumberEntry` adicionado a `src/types/stock.ts`

6. **Componentes**
   - [x] `src/components/stock/OrderNumberInput.tsx` - Input com verificação
   - [x] `src/components/stock/OrderNumberSelector.tsx` - Selectores para entrada/saída

### 🔄 Próximos Passos (Para implementar)

1. **Integrar na ManualStockSection**
   - Detectar categoria do produto
   - Mostrar `OrderNumberEntrySelector` para categorias que exigem
   - Adaptar fluxo de adição ao carrinho

2. **Integrar no StockExitsView**
   - Verificar se produto requer número de encomenda
   - Mostrar `OrderNumberExitSelector` em vez de input de quantidade
   - Remover número de encomenda após saída confirmada

3. **Integrar no ProductCard (Contagem)**
   - Interface especial para produtos com `requires_order_number`
   - Listar encomendas existentes
   - Permitir adicionar/remover encomendas

## Ficheiros Criados

| Ficheiro | Descrição |
|----------|-----------|
| `src/hooks/useOrderNumbers.tsx` | Hook para gestão de números de encomenda |
| `src/components/stock/OrderNumberInput.tsx` | Input com autocomplete e verificação |
| `src/components/stock/OrderNumberSelector.tsx` | Selectores para entrada/saída |

## Ficheiros Modificados

| Ficheiro | Alteração |
|----------|-----------|
| `src/hooks/useCategories.tsx` | Adicionado campo `requires_order_number` |
| `src/components/categories/CategoriesView.tsx` | Checkbox e badge para nº encomenda |
| `src/types/stock.ts` | Adicionado tipo `OrderNumberEntry` |
