
# Correcção: Stock Zerado ao Selecionar Localização + Ligação Palete-Localização

## Problemas Identificados

### Problema 1: Stock Zerado ao Selecionar Localização

Quando o utilizador seleccionou uma localização para o coli 2 do produto 017817F, o sistema criou um registo apenas para esse coli, deixando o coli 1 sem nenhum registo na tabela `counts`.

**Estado actual na base de dados:**
```text
Produto: 017817F (Sapateira Star Plus)
├── total_colis: 2
├── current_stock: 0  ← ERRADO! Deveria ser 7
│
└── Counts:
    ├── Coli 1: (NÃO EXISTE) ← Falta este registo!
    └── Coli 2: 7 unidades, B3, PLT052
```

**Cálculo do stock:**
- `current_stock = MIN(coli1, coli2) = MIN(0, 7) = 0`

O problema está na função `updateColisLocation` que, quando não existe um count para o coli, insere um novo registo com `quantity: 0`, zerando efectivamente o stock.

### Problema 2: Localização e Palete Independentes

Actualmente o utilizador pode selecionar localização e palete separadamente, mas a localização de um produto deveria ser determinada automaticamente pela localização do palete onde está.

**Modelo desejado:**
```text
┌─────────────────────────────────────────────────────────────────┐
│  ACTUAL (errado)                                                │
├─────────────────────────────────────────────────────────────────┤
│  Utilizador selecciona:                                         │
│  ├─ Localização: B3  (manualmente)                              │
│  └─ Palete: PLT052   (manualmente)                              │
│                                                                 │
│  Problema: Pode haver inconsistência se PLT052 estiver em B4!   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  DESEJADO (correcto)                                            │
├─────────────────────────────────────────────────────────────────┤
│  Utilizador selecciona:                                         │
│  └─ Palete: PLT052                                              │
│                                                                 │
│  Sistema deriva automaticamente:                                │
│  └─ Localização: B3 (localização do PLT052)                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Solução

### Parte 1: Corrigir Bug do Stock Zerado

**Problema**: `updateColisLocation` insere um novo count com `quantity: 0` quando não existe registo.

**Solução**: Ao actualizar localização/palete de um coli, preservar a quantidade existente ou buscar o valor correcto de outros colis do mesmo produto.

```text
Antes (bug):
  Se não existe count para coli X:
    INSERT (quantity: 0, location: nova) ← ERRADO

Depois (corrigido):
  Se não existe count para coli X:
    Buscar quantidade do produto (MIN dos outros colis ou stock actual)
    INSERT (quantity: quantidade_correcta, location: nova)
```

**Ficheiros a modificar:**
- `src/hooks/useCounting.tsx` - Funções `updateColisLocation` e `updateColisPalletNumber`

### Parte 2: Localização Amarrada ao Palete

**Mudanças no UI:**

1. **Remover `LocationSelect` do ProductCard** - O utilizador não selecciona localização directamente
2. **Modificar `PalletSelect`** - Quando o utilizador selecciona um palete, o sistema:
   - Grava o `pallet_number` no count
   - Deriva a `location` da tabela `warehouse_pallets.current_location_id`
   - Grava a `location` no count automaticamente
3. **Mostrar localização como informação** - Apenas exibir, não editar

**Ficheiros a modificar:**
- `src/components/counting/ProductCard.tsx` - Remover LocationSelect, manter apenas PalletSelect
- `src/components/counting/PalletSelect.tsx` - Adicionar callback para retornar também a localização
- `src/hooks/useCounting.tsx` - Modificar `updateColisPalletNumber` para também actualizar a localização automaticamente

### Parte 3: Corrigir Dados Existentes

Executar SQL para corrigir o produto 017817F:

```sql
-- Inserir coli 1 com a mesma quantidade do coli 2
INSERT INTO counts (product_id, colis_number, quantity, location, pallet_number, session_id)
SELECT product_id, 1, quantity, location, pallet_number, session_id
FROM counts 
WHERE product_id = '347da409-cc80-4294-8ac8-9cc5367170d5'
  AND colis_number = 2
LIMIT 1;

-- Recalcular stock
SELECT recalculate_all_stock();
```

---

## Detalhes Técnicos

### Modificação 1: useCounting.tsx - updateColisPalletNumber

```typescript
const updateColisPalletNumber = async (
  productId: string, 
  colisNumber: number, 
  palletNumber: string,
  locationFromPallet?: string // NOVO: localização derivada do palete
) => {
  if (!sessionId || !user) return false;

  const existingCount = counts.find(
    c => c.product_id === productId && c.colis_number === colisNumber
  );

  // Determinar a localização do palete
  let derivedLocation = locationFromPallet;
  if (!derivedLocation && palletNumber) {
    // Buscar localização do palete da tabela warehouse_pallets
    const { data: pallet } = await supabase
      .from('warehouse_pallets')
      .select('location:warehouse_locations(code)')
      .eq('code', palletNumber)
      .single();
    derivedLocation = pallet?.location?.code || null;
  }

  if (existingCount) {
    const { error } = await supabase
      .from('counts')
      .update({ 
        pallet_number: palletNumber,
        location: derivedLocation || existingCount.location // Actualizar localização também
      })
      .eq('id', existingCount.id);
    // ...
  } else {
    // CORRIGIDO: Buscar quantidade correcta antes de inserir
    const targetQuantity = await getCorrectQuantityForProduct(productId);
    
    const { error } = await supabase
      .from('counts')
      .insert({
        session_id: sessionId,
        product_id: productId,
        colis_number: colisNumber,
        quantity: targetQuantity, // NÃO usar 0!
        pallet_number: palletNumber,
        location: derivedLocation,
        counted_by: user.id
      });
    // ...
  }
};

// Nova função auxiliar
const getCorrectQuantityForProduct = async (productId: string): Promise<number> => {
  // Buscar current_stock do produto
  const { data: product } = await supabase
    .from('products')
    .select('current_stock')
    .eq('id', productId)
    .single();
  
  return product?.current_stock || 0;
};
```

### Modificação 2: ProductCard.tsx

Remover o `LocationSelect` e apenas mostrar a localização derivada do palete:

```tsx
{/* ANTES: Dois selects separados */}
<LocationSelect ... />
<PalletSelect ... />

{/* DEPOIS: Apenas palete, localização mostrada como info */}
<PalletSelect
  value={colisPallets[colisNum] ?? colisPallet ?? ''}
  onValueChange={(newPal, derivedLocation) => {
    setColisPallets(prev => ({ ...prev, [colisNum]: newPal }));
    if (onColisPalletChange) {
      onColisPalletChange(product.id, colisNum, newPal, derivedLocation);
    }
  }}
/>
{/* Mostrar localização derivada do palete */}
{derivedLocation && (
  <Badge variant="outline" className="text-xs">
    <MapPin className="h-3 w-3 mr-1" />
    {derivedLocation}
  </Badge>
)}
```

### Modificação 3: PalletSelect.tsx

Modificar o callback para incluir a localização do palete:

```tsx
interface PalletSelectProps {
  onValueChange: (value: string, location?: string) => void; // Adicionar localização
}

const handleSelect = (selectedValue: string) => {
  const selectedPallet = palletOptions.find(p => p.value === selectedValue);
  const location = selectedPallet?.location || undefined;
  
  onValueChange(
    selectedValue === value ? '' : selectedValue,
    location // Passa a localização junto
  );
  setOpen(false);
};
```

---

## Ficheiros a Modificar

| Ficheiro | Alteração |
|----------|-----------|
| `src/hooks/useCounting.tsx` | Corrigir `updateColisPalletNumber` para derivar localização e usar quantidade correcta |
| `src/components/counting/ProductCard.tsx` | Remover `LocationSelect`, usar apenas `PalletSelect` |
| `src/components/counting/PalletSelect.tsx` | Retornar localização do palete no callback |
| Base de dados | Corrigir produto 017817F inserindo coli 1 |

---

## Resultado Esperado

1. **Stock correcto**: Produto 017817F terá `current_stock = 7`
2. **UI simplificada**: Utilizador selecciona apenas o palete
3. **Localização automática**: Sistema deriva localização do palete
4. **Consistência**: Não há mais risco de seleccionar localização e palete incompatíveis
5. **Previne bugs futuros**: Novos counts são criados com a quantidade correcta, não 0
