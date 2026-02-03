

# Correção da Entrada de Stock: Divisão Automática e Opção de Localização

## Problemas Identificados

### Problema 1: Divisão Automática Indesejada

Quando se dá entrada de um produto, o sistema cria **novos registos de count** em vez de actualizar os existentes. Isto acontece porque:

```typescript
// Linha 229-238 do StockEntriesView.tsx
const { data: existingCount } = await supabase
  .from('counts')
  .select('id, quantity')
  .eq('product_id', item.product_id)
  .eq('colis_number', colisNumber)
  .eq('location', targetLocation || '')  // ← PROBLEMA AQUI
  .order('counted_at', { ascending: false })
  .limit(1)
  .maybeSingle();
```

O filtro `eq('location', targetLocation || '')` procura um count com localização exactamente igual. Se:
- O produto tem stock em "A1" mas `targetLocation` é "B2" (ou vazio)
- Não encontra o count existente
- Cria um novo registo ← **Divisão automática!**

### Problema 2: Falta Opção de Seleccionar Localização

O diálogo `EntryLocationDialog` só aparece se o produto já tiver **2+ localizações diferentes** (linha 143). O utilizador não tem opção de escolher localização quando:
- Produto tem 0 localizações (novo)
- Produto tem 1 localização existente

---

## Solução Proposta

### Parte 1: Sempre Mostrar Opção de Localização

Modificar a lógica para que o diálogo de destino apareça **sempre** que o utilizador quiser, com as seguintes opções:

| Cenário | Comportamento |
|---------|---------------|
| Produto sem stock | Mostrar apenas opção "Nova localização" |
| Produto com 1 localização | Mostrar localização existente + "Nova localização" |
| Produto com 2+ localizações | Mostrar todas + "Nova localização" |

Adicionar um **checkbox/toggle** no formulário de entrada para "Especificar localização" que, quando activado, força o diálogo a aparecer.

### Parte 2: Corrigir Lógica de Actualização

Quando o utilizador **não especifica localização**, o sistema deve:
1. Buscar counts existentes do produto (qualquer localização)
2. Actualizar o primeiro count encontrado (manter na mesma localização)
3. Só criar novo registo se não existir nenhum count

Quando o utilizador **especifica localização**:
1. Buscar count nessa localização específica
2. Se existir, actualizar
3. Se não existir, criar novo com essa localização

---

## Alterações Técnicas

### Ficheiro: `src/components/stock/StockEntriesView.tsx`

#### 1. Adicionar Toggle de Localização

```typescript
// Novo estado
const [specifyLocation, setSpecifyLocation] = useState(false);
```

#### 2. Modificar Função `checkForMultipleLocations`

Renomear para `prepareLocationSelection` e alterar lógica:

```typescript
const prepareLocationSelection = async (items: MovementItem[]): Promise<Array<{
  item: MovementItem;
  existingLocations: ExistingLocation[];
}>> => {
  const result: Array<{ item: MovementItem; existingLocations: ExistingLocation[] }> = [];

  for (const item of items) {
    if (pendingEntryDestinations.has(item.product_id)) continue;

    // Buscar localizações existentes
    const { data: counts } = await supabase
      .from('counts')
      .select('location, pallet_number, quantity')
      .eq('product_id', item.product_id)
      .gt('quantity', 0);

    // Agrupar por localização
    const locationMap = new Map<string, ExistingLocation>();
    (counts || []).forEach(c => {
      if (!c.location) return;
      const key = `${c.location}|${c.pallet_number || ''}`;
      const existing = locationMap.get(key);
      if (existing) {
        existing.quantity += c.quantity;
      } else {
        locationMap.set(key, {
          location: c.location,
          pallet: c.pallet_number,
          quantity: c.quantity,
        });
      }
    });

    const uniqueLocations = Array.from(locationMap.values());
    
    // NOVO: Sempre incluir se specifyLocation está activado
    // OU se há múltiplas localizações
    if (specifyLocation || uniqueLocations.length > 1) {
      result.push({ item, existingLocations: uniqueLocations });
    }
  }

  return result;
};
```

#### 3. Modificar Função `executeEntries`

```typescript
const executeEntries = async () => {
  setIsSubmitting(true);

  try {
    // 1. Registar em stock_movements
    await registerBulkMovements.mutateAsync({ ... });

    // 2. Actualizar counts
    for (const item of allItems) {
      const product = products.find(p => p.id === item.product_id);
      const totalColis = product?.total_colis || 1;
      const destination = pendingEntryDestinations.get(item.product_id);

      for (let colisNumber = 1; colisNumber <= totalColis; colisNumber++) {
        const colisQty = item.isCompleteSet !== false 
          ? item.quantity 
          : (item.colisQuantities?.[colisNumber] || 0);
        
        if (colisQty <= 0) continue;

        // NOVO: Se há destino específico, usar; senão, actualizar registo existente
        if (destination) {
          // Localização específica foi seleccionada
          const { data: existingCount } = await supabase
            .from('counts')
            .select('id, quantity')
            .eq('product_id', item.product_id)
            .eq('colis_number', colisNumber)
            .eq('location', destination.location)
            .maybeSingle();

          if (existingCount) {
            await supabase
              .from('counts')
              .update({ 
                quantity: existingCount.quantity + colisQty,
                pallet_number: destination.pallet,
                updated_at: new Date().toISOString() 
              })
              .eq('id', existingCount.id);
          } else {
            await supabase.from('counts').insert({
              product_id: item.product_id,
              colis_number: colisNumber,
              quantity: colisQty,
              session_id: null,
              location: destination.location,
              pallet_number: destination.pallet,
            });
          }
        } else {
          // SEM destino específico - actualizar count existente (qualquer localização)
          const { data: existingCount } = await supabase
            .from('counts')
            .select('id, quantity, location, pallet_number')
            .eq('product_id', item.product_id)
            .eq('colis_number', colisNumber)
            .order('quantity', { ascending: false }) // Preferir o com mais stock
            .limit(1)
            .maybeSingle();

          if (existingCount) {
            // Actualizar existente mantendo localização original
            await supabase
              .from('counts')
              .update({ 
                quantity: existingCount.quantity + colisQty,
                updated_at: new Date().toISOString() 
              })
              .eq('id', existingCount.id);
          } else {
            // Criar novo sem localização (ou com default do produto)
            await supabase.from('counts').insert({
              product_id: item.product_id,
              colis_number: colisNumber,
              quantity: colisQty,
              session_id: null,
              location: product?.location || null,
              pallet_number: product?.pallet_number || null,
            });
          }
        }
      }
    }

    // 3. Invalidar queries e reset
    // ...
  }
};
```

#### 4. Adicionar Toggle na UI

No formulário de confirmação, adicionar opção:

```tsx
<div className="flex items-center justify-between py-2 px-3 bg-muted/50 rounded-md">
  <div className="flex items-center gap-2 text-sm">
    <MapPin className="h-4 w-4 text-muted-foreground" />
    <span>Especificar localização</span>
  </div>
  <Switch
    checked={specifyLocation}
    onCheckedChange={setSpecifyLocation}
  />
</div>
```

---

## Ficheiros a Modificar

| Ficheiro | Alteração |
|----------|-----------|
| `src/components/stock/StockEntriesView.tsx` | Adicionar toggle, corrigir lógica de actualização |

---

## Resultado Esperado

1. **Sem divisão automática** - Entradas sem localização específica actualizam o count existente
2. **Opção de localização** - Toggle permite ao utilizador especificar onde armazenar
3. **Comportamento consistente** - Só há divisão quando o utilizador escolhe explicitamente

