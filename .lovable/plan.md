

# Plano: Sincronização Completa de Encomendas com Stock

## Resumo do Problema Actual

O sistema actual regista números de encomenda em `stock_order_numbers`, mas **não sincroniza** com a tabela `counts`. Isto significa que:
- Marcar/desmarcar colis numa encomenda **não actualiza o stock real**
- Adicionar uma encomenda **não incrementa os counts**
- Remover uma encomenda **não decrementa os counts**

## O Que Vamos Implementar

### 1. Localização e Palete Editáveis
Dentro de cada encomenda expandida, adicionar campos editáveis para:
- Localização (usando `LocationSelect`)
- Número de palete (usando `PalletSelect`)

### 2. Sincronização de Colis com Counts
Quando o operador marca/desmarca um coli na checklist de uma encomenda:
- **Marcar como presente**: Incrementar +1 na tabela `counts` para esse coli específico
- **Marcar como ausente**: Decrementar -1 na tabela `counts` para esse coli específico

### 3. Adicionar Encomenda = +1 em Cada Coli
Quando uma nova encomenda é registada:
- Criar registo em `stock_order_numbers` com todos os colis marcados
- **NOVO**: Incrementar +1 em `counts` para CADA coli do produto

### 4. Remover Encomenda = -1 em Cada Coli Presente
Quando uma encomenda é removida:
- Eliminar registo de `stock_order_numbers`
- **NOVO**: Decrementar -1 em `counts` para cada coli que estava marcado como presente

### 5. Saída de Stock Funcional
Nas saídas, ao seleccionar uma encomenda completa:
- Adicionar ao carrinho com referência à encomenda
- Na confirmação, remover o registo de `stock_order_numbers`
- Decrementar counts (já tratado pelo fluxo de picking existente)

## Fluxo Visual Actualizado

```text
ENCOMENDA EXPANDIDA COM LOCALIZAÇÃO EDITÁVEL:
┌─────────────────────────────────────────────────────────────────────────┐
│  ENC-2024-001  │ ✓ Completa │ [🗑️]                                      │
├─────────────────────────────────────────────────────────────────────────┤
│  📍 Localização: [ A-01-N1  ▼ ]    📦 Palete: [ PAL-001  ▼ ]           │
├─────────────────────────────────────────────────────────────────────────┤
│  [✓] Coli 1 - Cabeceira      ← Checkbox sincroniza com counts          │
│  [✓] Coli 2 - Estrado                                                   │
│  [✓] Coli 3 - Gavetas                                                   │
│  [ ] Coli 4 - Pés            ← Desmarcar = -1 no count do Coli 4       │
└─────────────────────────────────────────────────────────────────────────┘

ADICIONAR ENCOMENDA:
  1. Criar registo em stock_order_numbers
  2. Para cada coli (1 a total_colis):
     - Incrementar +1 em counts para esse coli
  3. Trigger existente recalcula current_stock do produto

REMOVER ENCOMENDA:
  1. Ler colis_status da encomenda
  2. Para cada coli marcado como presente:
     - Decrementar -1 em counts para esse coli
  3. Eliminar registo de stock_order_numbers
  4. Trigger existente recalcula current_stock do produto

MARCAR/DESMARCAR COLI:
  Marcar ✓:  UPDATE counts SET quantity = quantity + 1 WHERE coli = X
  Desmarcar: UPDATE counts SET quantity = quantity - 1 WHERE coli = X
```

## Alterações Técnicas

### Ficheiro: `src/hooks/useOrderNumbers.tsx`

**Função `addOrderNumber`** - Adicionar sincronização com counts:
```typescript
const addOrderNumber = async (orderNumber, location, palletNumber) => {
  // 1. Criar registo em stock_order_numbers (já existe)
  const { data } = await supabase.from('stock_order_numbers').insert({...});
  
  // 2. NOVO: Incrementar counts para cada coli
  for (let i = 1; i <= totalColis; i++) {
    // Encontrar ou criar count para este coli
    const { data: existingCount } = await supabase
      .from('counts')
      .select('id, quantity')
      .eq('product_id', productId)
      .eq('colis_number', i)
      .maybeSingle();
    
    if (existingCount) {
      await supabase.from('counts')
        .update({ quantity: existingCount.quantity + 1 })
        .eq('id', existingCount.id);
    } else {
      await supabase.from('counts')
        .insert({ product_id: productId, colis_number: i, quantity: 1, location, pallet_number: palletNumber });
    }
  }
  
  return entry;
};
```

**Função `updateColisStatus`** - Sincronizar toggle com counts:
```typescript
const updateColisStatus = async (orderId, colisNumber, isPresent) => {
  // 1. Actualizar colis_status na encomenda (já existe)
  await supabase.from('stock_order_numbers')
    .update({ colis_status: newColisStatus })
    .eq('id', orderId);
  
  // 2. NOVO: Actualizar count correspondente
  const { data: existingCount } = await supabase
    .from('counts')
    .select('id, quantity')
    .eq('product_id', order.product_id)
    .eq('colis_number', colisNumber)
    .maybeSingle();
  
  const delta = isPresent ? 1 : -1;
  
  if (existingCount) {
    const newQty = Math.max(0, existingCount.quantity + delta);
    await supabase.from('counts')
      .update({ quantity: newQty })
      .eq('id', existingCount.id);
  } else if (isPresent) {
    await supabase.from('counts')
      .insert({ product_id: order.product_id, colis_number: colisNumber, quantity: 1 });
  }
  
  return true;
};
```

**Função `deleteOrderNumber`** - Decrementar counts antes de eliminar:
```typescript
const deleteOrderNumber = async (orderId) => {
  // 1. NOVO: Ler encomenda para saber quais colis estão presentes
  const order = orderNumbers.find(o => o.id === orderId);
  if (!order) return false;
  
  // 2. NOVO: Decrementar counts para cada coli presente
  for (const [colisNum, isPresent] of Object.entries(order.colis_status)) {
    if (isPresent) {
      const { data: existingCount } = await supabase
        .from('counts')
        .select('id, quantity')
        .eq('product_id', order.product_id)
        .eq('colis_number', parseInt(colisNum))
        .maybeSingle();
      
      if (existingCount) {
        const newQty = Math.max(0, existingCount.quantity - 1);
        await supabase.from('counts')
          .update({ quantity: newQty })
          .eq('id', existingCount.id);
      }
    }
  }
  
  // 3. Eliminar registo (já existe)
  await supabase.from('stock_order_numbers').delete().eq('id', orderId);
  
  return true;
};
```

### Ficheiro: `src/components/stock/OrderNumberSelector.tsx`

**Componente `OrderRow`** - Adicionar campos de localização e palete editáveis:
```typescript
function OrderRow({ order, onLocationChange, onPalletChange, ... }) {
  return (
    <Collapsible>
      {/* Header existente */}
      
      <CollapsibleContent>
        {/* NOVO: Campos de localização e palete */}
        <div className="flex gap-2 mb-2 px-3">
          <div className="flex-1">
            <Label className="text-xs">Localização</Label>
            <LocationSelect
              value={order.location || ''}
              onChange={(value) => onLocationChange(order.id, value)}
            />
          </div>
          <div className="flex-1">
            <Label className="text-xs">Palete</Label>
            <PalletSelect
              value={order.pallet_number || ''}
              onChange={(value) => onPalletChange(order.id, value)}
            />
          </div>
        </div>
        
        {/* Checklist de colis existente */}
        {Array.from({ length: totalColis }, ...).map(colisNum => (
          <Checkbox 
            checked={order.colis_status[colisNum]} 
            onCheckedChange={() => onColisToggle(orderId, colisNum, isPresent)}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
```

**Actualizar `OrderNumberEntrySelector`**:
- Passar `updateOrderLocation` do hook para `OrderRow`
- Adicionar import de `LocationSelect` e `PalletSelect`

### Ficheiro: `src/components/stock/StockExitsView.tsx`

Na função `handleFinalConfirm`:
```typescript
// Para cada item com orderNumber, remover da tabela stock_order_numbers
for (const item of detailedPickingItems) {
  const cartItem = allItems.find(ci => ci.product_id === item.product_id);
  
  if (cartItem?.orderNumber) {
    // Encontrar e remover a encomenda
    const { data: orderEntry } = await supabase
      .from('stock_order_numbers')
      .select('id')
      .eq('product_id', item.product_id)
      .eq('order_number', cartItem.orderNumber)
      .single();
    
    if (orderEntry) {
      await removeOrderNumberAfterExit(orderEntry.id);
    }
  }
  
  // O resto do fluxo (decrementar counts) já está implementado
}
```

## Ficheiros a Modificar

| Ficheiro | Alteração |
|----------|-----------|
| `src/hooks/useOrderNumbers.tsx` | Sincronizar CRUD com tabela `counts` |
| `src/components/stock/OrderNumberSelector.tsx` | Campos editáveis de localização/palete no `OrderRow` |
| `src/components/stock/StockExitsView.tsx` | Remover `stock_order_numbers` após saída confirmada |

## Resultado Esperado

1. **Ao adicionar encomenda**: Stock sobe (+1 por coli)
2. **Ao marcar coli**: Stock desse coli sobe +1
3. **Ao desmarcar coli**: Stock desse coli desce -1
4. **Ao remover encomenda**: Stock desce (-1 por cada coli presente)
5. **Ao fazer saída**: Encomenda é removida de `stock_order_numbers`

O stock fica **sempre sincronizado** entre a tabela de encomendas e a contagem real.

