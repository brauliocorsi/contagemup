
# Plano: Botão "Set Completo" para Entradas e Saídas

## Funcionalidade Solicitada

Adicionar uma opção nas interfaces de Entradas e Saídas de stock para que, ao clicar num botão, o sistema preencha automaticamente todos os colis de um produto com a mesma quantidade, completando sets inteiros.

## Comportamento Actual vs. Desejado

| Situação Actual | Situação Desejada |
|-----------------|-------------------|
| Operador seleciona quantidade (ex: 5) e adiciona produto | Operador pode escolher "5 Sets Completos" |
| Sistema regista 5 unidades no total | Sistema preenche automaticamente colis 1: 5, colis 2: 5, colis 3: 5... |
| Não há distinção entre colis | Cada colis recebe a mesma quantidade |

## Interface Proposta

```text
┌──────────────────────────────────────────────────────────────────────┐
│  Produto: Estante Lino Rodi (4 colis)         Stock: 10 sets        │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  Quantidade: [__5__]                                            │ │
│  │                                                                 │ │
│  │  [ ✓ Set Completo ]  [ Colis Individual ]                      │ │
│  │                                                                 │ │
│  │  Preview:                                                       │ │
│  │  • Coli 1: 5 un. | Coli 2: 5 un. | Coli 3: 5 un. | Coli 4: 5 un.│ │
│  │  • Sets a adicionar: 5                                          │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  [Adicionar ao Carrinho]                                             │
└──────────────────────────────────────────────────────────────────────┘
```

Para produtos com `total_colis = 1`, o comportamento permanece inalterado.

## Alterações Técnicas

### 1. Actualizar Tipo MovementItem

**Ficheiro**: `src/hooks/useStockMovements.tsx`

```typescript
export interface MovementItem {
  product_id: string;
  product_code: string;
  product_name: string;
  quantity: number;
  // NOVO: Indica se é set completo ou entrada por colis individual
  isCompleteSet?: boolean;
  // NOVO: Para modo individual, quantidade por colis
  colisQuantities?: Record<number, number>; // { 1: 5, 2: 3, 3: 0 }
  // Info adicional para display
  totalColis?: number;
}
```

### 2. Actualizar ManualStockSection

**Ficheiro**: `src/components/stock/ManualStockSection.tsx`

Alterações:
- Detectar produtos com `total_colis > 1`
- Adicionar toggle "Set Completo" vs "Colis Individual"
- Modo "Set Completo" (default): quantidade aplica-se a todos os colis
- Modo "Colis Individual": mostra inputs separados por colis
- Preview visual do que vai ser registado

### 3. Actualizar StockEntriesView

**Ficheiro**: `src/components/stock/StockEntriesView.tsx`

Actualizar `handleConfirm` para:

```typescript
for (const item of allItems) {
  const product = products.find(p => p.id === item.product_id);
  const totalColis = product?.total_colis || 1;

  for (let colisNumber = 1; colisNumber <= totalColis; colisNumber++) {
    // Se é set completo, usar item.quantity para todos os colis
    // Se é individual, usar item.colisQuantities[colisNumber]
    const colisQty = item.isCompleteSet !== false 
      ? item.quantity 
      : (item.colisQuantities?.[colisNumber] || 0);
    
    // Buscar e actualizar count...
  }
}
```

### 4. Actualizar StockExitsView

**Ficheiro**: `src/components/stock/StockExitsView.tsx`

Mesma lógica de `handleFinalConfirm`:
- Para saídas "Set Completo": decrementar todos os colis pela mesma quantidade
- Validar que há stock suficiente em TODOS os colis
- Preview mostra detalhes de cada colis

### 5. Validação de Stock (Saídas)

Para saídas em modo "Set Completo":
- Verificar que o mínimo de todos os colis >= quantidade pedida
- Se algum colis não tiver stock suficiente, mostrar erro específico

```typescript
// Validação para set completo
const minColisStock = Math.min(...colisQuantities);
if (requestedQty > minColisStock) {
  // Erro: "Só há X sets completos disponíveis"
}
```

## Fluxo de Dados

```text
ENTRADA/SAÍDA COM SET COMPLETO:

Utilizador seleciona:     Sistema regista:
┌─────────────────┐       ┌─────────────────────────────┐
│ Produto: Estante│       │ counts:                     │
│ Quantidade: 5   │ ────▶ │  - coli_1: +5               │
│ [✓] Set Completo│       │  - coli_2: +5               │
└─────────────────┘       │  - coli_3: +5               │
                          │  - coli_4: +5               │
                          │ current_stock: +5 sets      │
                          └─────────────────────────────┘
```

## Ficheiros a Modificar

| Ficheiro | Alteração |
|----------|-----------|
| `src/hooks/useStockMovements.tsx` | Adicionar campos `isCompleteSet`, `colisQuantities`, `totalColis` ao tipo |
| `src/components/stock/ManualStockSection.tsx` | Toggle Set/Individual + inputs por colis |
| `src/components/stock/StockEntriesView.tsx` | Lógica de confirmação por set/colis |
| `src/components/stock/StockExitsView.tsx` | Validação e saída por set/colis |

## Experiência do Utilizador

1. **Produtos simples (1 colis)**: Sem alterações, comportamento actual
2. **Produtos multi-colis (default)**: Modo "Set Completo" activo por omissão
3. **Opção de granularidade**: Operador pode mudar para modo individual se necessário
4. **Feedback visual**: Preview claro do que vai ser registado em cada colis

## Compatibilidade

- Produtos com `total_colis = 1`: Comportamento inalterado
- Dados existentes: Não afectados, apenas novos movimentos usam a lógica
- Carrinho misto: Suporta itens em modo set e individual simultaneamente
