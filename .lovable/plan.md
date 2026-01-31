
# Plano: Corrigir Lógica de Encomendas com Colis Individuais

## Problema Identificado

Actualmente, quando se adiciona uma encomenda:
1. O sistema marca **TODOS os colis como presentes** automaticamente (`colis_status: {"1": true, "2": true, ...}`)
2. Incrementa +1 em counts para **TODOS os colis**

Isto não reflecte a realidade onde encomendas podem chegar incompletas (faltando colis).

## Solução Proposta

### Fluxo Corrigido

```text
ADICIONAR ENCOMENDA (opção 1 - vazia):
┌─────────────────────────────────────────────────────────────────────────┐
│  Novo número: [_ENC-2024-005_______________] [+ Adicionar Vazia]        │
│                                                                          │
│  ↓ Cria encomenda com todos os colis DESMARCADOS                        │
│  ↓ NÃO incrementa counts (stock não muda)                               │
│  ↓ Operador marca cada coli à medida que recebe                         │
│    └→ Marcar Coli 1: +1 no count do Coli 1                              │
│    └→ Marcar Coli 2: +1 no count do Coli 2                              │
│    └→ etc...                                                             │
└─────────────────────────────────────────────────────────────────────────┘

ADICIONAR ENCOMENDA (opção 2 - completa):
┌─────────────────────────────────────────────────────────────────────────┐
│  Novo número: [_ENC-2024-005_______________] [+ Adicionar Completa]     │
│                                                                          │
│  ↓ Cria encomenda com todos os colis MARCADOS (comportamento actual)    │
│  ↓ Incrementa +1 para TODOS os colis                                    │
│  ↓ Stock sobe imediatamente                                              │
└─────────────────────────────────────────────────────────────────────────┘
```

### Alterações Técnicas

#### 1. `src/hooks/useOrderNumbers.tsx`

**Nova função `addOrderNumberEmpty`** - Adicionar encomenda SEM marcar colis:
```typescript
const addOrderNumberEmpty = async (
  orderNumber: string,
  location?: string | null,
  palletNumber?: string | null
): Promise<OrderNumberEntry | null> => {
  // Criar colis_status com TODOS os colis a false
  const colisStatus: Record<string, boolean> = {};
  for (let i = 1; i <= totalColis; i++) {
    colisStatus[i.toString()] = false;
  }

  // Insert na tabela stock_order_numbers
  const { data, error } = await supabase
    .from('stock_order_numbers')
    .insert({
      product_id: productId,
      order_number: orderNumber.trim(),
      colis_status: colisStatus, // TODOS false
      location: location || null,
      pallet_number: palletNumber || null
    })
    .select()
    .single();

  // NÃO incrementar counts - operador vai marcar manualmente
  return entry;
};
```

**Renomear `addOrderNumber` para `addOrderNumberComplete`** (manter comportamento actual):
```typescript
const addOrderNumberComplete = async (...) => {
  // Mantém lógica actual: todos colis true + incrementa counts
};
```

#### 2. `src/components/stock/OrderNumberSelector.tsx`

**Actualizar `OrderNumberEntrySelector`**:
```typescript
// Adicionar toggle ou dois botões
<div className="flex gap-2">
  <Input
    value={newOrderNumber}
    onChange={(e) => setNewOrderNumber(e.target.value)}
    placeholder="Novo número de encomenda..."
  />
  <Button
    size="sm"
    variant="outline"
    onClick={() => handleAddEmpty()} // Adiciona vazia
  >
    + Vazia
  </Button>
  <Button
    size="sm"
    onClick={() => handleAddComplete()} // Adiciona completa
  >
    + Completa
  </Button>
</div>
```

Ou usar um **Switch/Toggle** mais elegante:
```typescript
const [addAsComplete, setAddAsComplete] = useState(true);

<div className="flex items-center gap-2 text-xs">
  <Switch 
    checked={addAsComplete} 
    onCheckedChange={setAddAsComplete} 
  />
  <span>{addAsComplete ? 'Adicionar como completa' : 'Adicionar vazia (marcar colis depois)'}</span>
</div>
```

#### 3. Validação na Saída

**Verificar se encomenda está completa antes de permitir saída**:
```typescript
// Em OrderNumberExitSelector
const handleSelect = (order: OrderNumberEntry) => {
  if (!order.is_complete) {
    toast.error('Esta encomenda está incompleta. Complete todos os colis primeiro.');
    return;
  }
  onAddToCart(order);
};
```

#### 4. Garantir Sincronização na Remoção

**Já implementado correctamente**: `deleteOrderNumber` decrementa counts apenas para colis marcados como presentes.

## Ficheiros a Modificar

| Ficheiro | Alteração |
|----------|-----------|
| `src/hooks/useOrderNumbers.tsx` | Adicionar `addOrderNumberEmpty`, manter `addOrderNumber` como opção completa |
| `src/components/stock/OrderNumberSelector.tsx` | UI com opção de adicionar vazia ou completa |

## Interface Visual Proposta

```text
┌─────────────────────────────────────────────────────────────────────────┐
│  📋 Registar Nº Encomenda                                               │
│  CAM-001 - Cama Oslo Queen                                              │
├─────────────────────────────────────────────────────────────────────────┤
│  Novo: [_ENC-2024-005_______________]                                   │
│                                                                          │
│  [◉ Todos colis presentes]  [○ Marcar colis depois]                     │
│                                                                          │
│  [+ Adicionar Encomenda]                                                │
├─────────────────────────────────────────────────────────────────────────┤
│  Encomendas em stock (3):                                               │
│                                                                          │
│  ▼ ENC-2024-001  │ ✓ Completa │ A-01 │ PAL-001 │ [🗑️]                   │
│    ├─ ☑ Coli 1 - Cabeceira                                              │
│    ├─ ☑ Coli 2 - Estrado                                                │
│    ├─ ☑ Coli 3 - Gavetas                                                │
│    └─ ☑ Coli 4 - Pés                                                    │
│                                                                          │
│  ▼ ENC-2024-002  │ ⚠ 2/4 colis │ [🗑️]        ← INCOMPLETA              │
│    ├─ ☑ Coli 1 - Cabeceira     +1 no count                             │
│    ├─ ☑ Coli 2 - Estrado       +1 no count                             │
│    ├─ ☐ Coli 3 - Gavetas       (ainda não chegou)                      │
│    └─ ☐ Coli 4 - Pés           (ainda não chegou)                      │
│                                                                          │
│  ⚠ 1 encomenda incompleta                                               │
└─────────────────────────────────────────────────────────────────────────┘
```

## Comportamento Resumido

| Acção | Efeito no Stock |
|-------|-----------------|
| Adicionar encomenda COMPLETA | +1 em TODOS os colis |
| Adicionar encomenda VAZIA | Nenhum (stock não muda) |
| Marcar coli como presente | +1 no count desse coli |
| Desmarcar coli | -1 no count desse coli |
| Remover encomenda | -1 para cada coli que estava marcado |
| Saída de encomenda | Remove registo + -1 para cada coli (via picking) |

## Sincronização de Sets Completos

O trigger `sync_product_stock` na base de dados já calcula correctamente:
- Para produtos multi-coli: `current_stock = MIN(count_coli_1, count_coli_2, ..., count_coli_n)`
- Só conta como set completo quando TODOS os colis têm quantidade suficiente

Isto significa que:
- Encomenda incompleta (ex: só 2 de 4 colis) NÃO aumenta sets completos
- Quando o último coli da encomenda é marcado, o stock de sets sobe automaticamente
