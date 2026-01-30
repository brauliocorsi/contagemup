
# Plano: Entradas e Saídas por Colis

## Problema Identificado

O sistema atual tem duas fontes de verdade separadas:

| Tabela | Finalidade | Reflectido em |
|--------|-----------|---------------|
| `counts` | Contagem física de cada colis | Ícones no ProductCard |
| `stock_movements` | Entradas administrativas | current_stock (via trigger) |
| `picking_items` | Saídas de picking | current_stock (via trigger) |

**Exemplo concreto**:
- Sistema Elevatório: `counts` = 10, `entradas` = 100
- `current_stock` = 110 (correcto via trigger)
- Ícones de contagem mostram: **10** (incorrecto - deveria mostrar 110)

## Solução: Unificar Entradas/Saídas na Tabela `counts`

### Nova Abordagem

Quando o utilizador regista uma **entrada** ou **saída**, o sistema irá:
1. Atualizar a quantidade em `counts` para **cada colis** do produto
2. Manter `stock_movements` apenas para auditoria/histórico (opcional)

### Alterações Necessárias

#### 1. Migração de Base de Dados
- Permitir `session_id` NULL na tabela `counts` para movimentos administrativos
- OU criar uma sessão especial "Movimentos Administrativos"

```sql
ALTER TABLE counts ALTER COLUMN session_id DROP NOT NULL;
```

#### 2. Atualizar `StockEntriesView.tsx`
No `handleConfirm`, após registar em `stock_movements`:

```typescript
for (const item of allItems) {
  const product = products.find(p => p.id === item.product_id);
  const totalColis = product?.total_colis || 1;
  
  // Atualizar TODOS os colis do produto
  for (let colisNumber = 1; colisNumber <= totalColis; colisNumber++) {
    // Buscar count existente
    const existingCount = await supabase
      .from('counts')
      .select('id, quantity')
      .eq('product_id', item.product_id)
      .eq('colis_number', colisNumber)
      .maybeSingle();

    const currentQty = existingCount?.quantity || 0;
    const newQty = currentQty + item.quantity;

    if (existingCount) {
      await supabase.from('counts')
        .update({ quantity: newQty })
        .eq('id', existingCount.id);
    } else {
      // Criar novo count sem sessão (administrativo)
      await supabase.from('counts').insert({
        product_id: item.product_id,
        colis_number: colisNumber,
        quantity: item.quantity,
        session_id: null, // Movimento administrativo
      });
    }
  }
}
```

#### 3. Atualizar `StockExitsView.tsx`
Já decrementa `counts` para colis 1. Expandir para **todos os colis**:

```typescript
for (const item of detailedPickingItems) {
  const product = products.find(p => p.id === item.product_id);
  const totalColis = product?.total_colis || 1;
  
  // Decrementar TODOS os colis do produto
  for (let colisNumber = 1; colisNumber <= totalColis; colisNumber++) {
    const existingCount = await supabase
      .from('counts')
      .select('id, quantity')
      .eq('product_id', item.product_id)
      .eq('colis_number', colisNumber)
      .maybeSingle();

    if (existingCount) {
      const newQty = Math.max(0, existingCount.quantity - item.quantity);
      await supabase.from('counts')
        .update({ quantity: newQty })
        .eq('id', existingCount.id);
    }
  }
}
```

#### 4. Simplificar Trigger de Stock (Opcional)
Após unificar, o `current_stock` pode ser calculado apenas dos `counts` + `picking`:
- Base = mínimo(counts por colis)
- - picking

Mas podemos manter o trigger atual que já funciona.

## Impacto nos Sets Completos

Para produtos com múltiplos colis, as entradas incrementarão **todos os colis igualmente**, garantindo que os sets completos aumentam proporcionalmente.

| Antes | Depois (entrada +5) |
|-------|---------------------|
| Colis 1: 10, Colis 2: 10, Colis 3: 8 | Colis 1: 15, Colis 2: 15, Colis 3: 13 |
| Sets completos: 8 | Sets completos: 13 |

## Ficheiros a Modificar

1. **Migração SQL**: Permitir `session_id` NULL em `counts`
2. **`src/components/stock/StockEntriesView.tsx`**: Atualizar counts ao registar entrada
3. **`src/components/stock/StockExitsView.tsx`**: Decrementar todos os colis (já decrementa colis 1)
4. **`src/hooks/useProducts.tsx`**: Buscar dados de produto para obter `total_colis`

## Consistência Visual

Após implementação:
- Ícones de contagem = `current_stock` (ambos reflectem a mesma realidade)
- Sets completos calculados corretamente
- Entradas/saídas afectam todos os colis uniformemente
