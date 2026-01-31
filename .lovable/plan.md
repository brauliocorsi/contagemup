
# Plano: Integrar Interface de Número de Encomenda na Contagem e Stock

## O Que Vamos Fazer

Integrar os componentes já criados (`OrderNumberEntrySelector`, `OrderNumberExitSelector`) nos locais onde o utilizador regista stock:

1. **Contagem (ProductCard)** - Para registar novas encomendas durante inventário
2. **Entradas de Stock** - Para adicionar produtos com número de encomenda
3. **Saídas de Stock** - Para seleccionar a encomenda que vai sair

## Alterações Necessárias

### 1. CountingView.tsx - Passar info de categorias

Actualmente o `CountingView` já usa `useCategories`, mas não passa a informação `requires_order_number` para os `ProductCard`.

```typescript
// Adicionar mapa de categorias que exigem encomenda
const categoriesRequiringOrder = useMemo(() => {
  const map: Record<string, boolean> = {};
  categories.forEach(cat => {
    map[cat.name] = cat.requires_order_number;
  });
  return map;
}, [categories]);

// Passar para ProductCard
<ProductCard
  ...
  requiresOrderNumber={categoriesRequiringOrder[product.category]}
/>
```

### 2. ProductCard.tsx - Mostrar Interface de Encomenda

Para produtos de categorias com `requires_order_number = true`:
- Esconder os botões normais de +/- 
- Mostrar o `OrderNumberEntrySelector` em vez disso
- Listar encomendas existentes com status de cada coli

```text
┌─────────────────────────────────────────────────────────────────────────┐
│  🏷️ Cama Oslo Queen                           Categoria: Camas 🔒      │
│  Código: CAM-001 | 4 Colis                                              │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │  📋 Registar Nº Encomenda                                           ││
│  │  Novo: [_ENC-2024-005_______________] [+ Adicionar]                 ││
│  │                                                                      ││
│  │  Encomendas em stock (3):                                           ││
│  │  ┌─────────────────────────────────────────────────────────────────┐││
│  │  │ ENC-2024-001 │ C1✓ C2✓ C3✓ C4✓ │ ✓ Completa │ A-01 │ PAL-001  │││
│  │  │ ENC-2024-002 │ C1✓ C2✓ C3✗ C4✓ │ ⚠ Incompleta                  │││
│  │  │ ENC-2024-003 │ C1✓ C2✓ C3✓ C4✓ │ ✓ Completa │ A-02 │ PAL-002  │││
│  │  └─────────────────────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

### 3. ManualStockSection.tsx - Detectar e mostrar interface

Para entradas de stock:
```typescript
// Detectar se categoria exige número de encomenda
const categoryRequiresOrder = useMemo(() => {
  const map: Record<string, boolean> = {};
  categories.forEach(cat => {
    map[cat.name] = cat.requires_order_number;
  });
  return map;
}, [categories]);

// Se exige, mostrar OrderNumberEntrySelector
{categoryRequiresOrder[product.category] ? (
  <OrderNumberEntrySelector
    productId={product.id}
    productCode={product.code}
    productName={product.name}
    totalColis={product.total_colis}
    onOrderAdded={() => refetchProducts()}
  />
) : (
  // Interface normal de quantidade
)}
```

### 4. StockExitsView.tsx - Seleccionar encomenda para saída

Para saídas, mostrar o `OrderNumberExitSelector`:
```typescript
{categoryRequiresOrder[product.category] ? (
  <OrderNumberExitSelector
    productId={product.id}
    productCode={product.code}
    productName={product.name}
    totalColis={product.total_colis}
    onAddToCart={(orderEntry) => {
      // Adicionar ao carrinho com referência à encomenda
      handleAddOrderToCart(orderEntry);
    }}
  />
) : (
  // Interface normal de quantidade
)}
```

## Ficheiros a Modificar

| Ficheiro | Alteração |
|----------|-----------|
| `src/components/counting/CountingView.tsx` | Passar `requiresOrderNumber` para ProductCard |
| `src/components/counting/ProductCard.tsx` | Mostrar interface de encomenda quando exigido |
| `src/components/stock/ManualStockSection.tsx` | Integrar OrderNumberEntrySelector |
| `src/components/stock/StockExitsView.tsx` | Integrar OrderNumberExitSelector |

## Fluxo Esperado

### Na Contagem:
1. Operador abre contagem com sessão activa
2. Pesquisa produto de categoria "Camas" (que exige encomenda)
3. Vê interface especial com input de número de encomenda
4. Digita "ENC-2024-005" e clica "Adicionar"
5. Sistema cria registo em `stock_order_numbers` com todos os colis marcados
6. A encomenda aparece na lista como "Completa"

### Nas Entradas:
1. Operador vai a Entradas de Stock
2. Pesquisa produto de categoria "Camas"
3. Vê interface de encomenda em vez de quantidade
4. Adiciona número de encomenda
5. Sistema regista entrada com referência à encomenda

### Nas Saídas:
1. Operador vai a Saídas de Stock
2. Pesquisa produto de categoria "Camas"
3. Vê lista de encomendas disponíveis (completas)
4. Selecciona "ENC-2024-001"
5. Sistema verifica se está completa e mostra localização
6. Ao confirmar, remove da tabela `stock_order_numbers`

## Detalhes Técnicos

### Interface de Colis por Encomenda
Para encomendas incompletas (alguns colis em falta), mostrar checkboxes:

```text
ENC-2024-002:
  [✓] Coli 1 - Cabeceira
  [✓] Coli 2 - Estrado  
  [✗] Coli 3 - Gavetas    ← Não está em stock
  [✓] Coli 4 - Colchão
```

Permite marcar/desmarcar colis individuais à medida que chegam.

### Sincronização com Counts
Quando uma encomenda é adicionada:
- Criar registo em `stock_order_numbers` com `colis_status: {"1": true, "2": true, ...}`
- Incrementar `counts` de cada coli (+1)

Quando uma encomenda sai:
- Remover registo de `stock_order_numbers`
- Decrementar `counts` de cada coli (-1)
