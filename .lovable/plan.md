

# Implementação: Selecção de Localização em Saídas/Entradas + Controle por Localização

## Resumo do Pedido

O utilizador pretende:

1. **Saídas de Stock**: Quando um coli está dividido em múltiplas localizações, ao dar saída deve poder seleccionar de qual localização tirar o produto
2. **Botões +/- no ProductCard**: Quando há localização dividida, os botões do coli "master" devem ser desactivados, forçando o utilizador a expandir e usar os botões por localização
3. **Entradas de Stock**: Ao dar entrada, deve poder seleccionar se vai para mesma localização, nova localização, ou escolher uma localização existente (quando há colis divididos)
4. **Paletes opcionais**: Alguns produtos precisam apenas de localização, sem número de palete

---

## Problema Actual

**Situação descrita:**
```text
Produto X
├── Coli 1/2: 6un em B3 + 1un em C12  (dividido)
├── Coli 2/2: 3un em B3 + 3un em C12  (dividido)
└── Sets Completos: 4 (min dos totais: min(7,6)=6 → mas na verdade 3+3=6)

Problema nas SAÍDAS:
→ Ao retirar 2 sets, de qual localização tirar?
→ Se tirar de B3: Coli1 fica 4un, Coli2 fica 1un em B3
→ Se tirar de C12: Coli1 fica 0un (ou 1un-2?), Coli2 fica 1un em C12
→ FALTA opção para o utilizador escolher!

Problema nas ENTRADAS:
→ Ao adicionar 3 sets, onde colocar?
→ Adicionar a B3? A C12? Nova localização?
→ FALTA opção para o utilizador escolher!
```

---

## Solução

### Parte 1: ProductCard - Desactivar botões "master" quando dividido

**Comportamento actual:**
- Botões +/- no coli sempre activos
- Ao clicar, incrementa/decrementa o primeiro registo encontrado

**Comportamento desejado:**
- Quando coli tem múltiplas localizações (`hasMultipleLocations = true`), os botões +/- do coli principal ficam **desactivados**
- Uma mensagem indica "Use os controlos por localização abaixo"
- O coli fica automaticamente expandido quando dividido

**Ficheiro:** `src/components/counting/ProductCard.tsx`

### Parte 2: Saídas de Stock - Selecção de Localização

**Fluxo actual:**
```text
1. Seleccionar produto
2. Escolher quantidade
3. Confirmar → Decrementa dos counts automaticamente
```

**Fluxo desejado:**
```text
1. Seleccionar produto
2. Escolher quantidade
3. Se produto tem colis divididos:
   a. Sistema detecta quais colis têm múltiplas localizações
   b. Mostra dialog/UI para escolher de onde tirar
   c. Ex: "Coli 1 - Retirar 2un de: B3 (tem 6) / C12 (tem 1)"
4. Confirmar → Decrementa das localizações específicas
```

**Ficheiros:**
- `src/components/stock/StockExitsView.tsx`
- `src/components/stock/ManualStockSection.tsx` 
- Criar: `src/components/stock/LocationSelectionDialog.tsx`

### Parte 3: Entradas de Stock - Selecção de Destino

**Fluxo actual:**
```text
1. Seleccionar produto
2. Escolher quantidade
3. Confirmar → Adiciona ao primeiro count existente
```

**Fluxo desejado:**
```text
1. Seleccionar produto
2. Escolher quantidade
3. Se produto tem colis divididos:
   a. Mostrar opções:
      - "Adicionar à localização existente" (escolher qual)
      - "Nova localização" (seleccionar palete/localização)
      - "Distribuir entre localizações" (para cada colis)
   b. Seleccionar palete (opcional) e/ou localização
4. Confirmar → Adiciona à(s) localização(ões) escolhida(s)
```

**Ficheiros:**
- `src/components/stock/StockEntriesView.tsx`
- `src/components/stock/ManualStockSection.tsx`
- Criar: `src/components/stock/EntryLocationDialog.tsx`

---

## Detalhes Técnicos

### Modificação 1: ProductCard.tsx - Desactivar botões em colis divididos

```tsx
// No render do coli principal:
const hasMultipleLocationsForColi = colisDetail?.hasMultipleLocations || false;

{/* Botões +/- desactivados se dividido */}
<Button
  variant="outline"
  size="icon"
  className="h-8 w-8"
  onClick={() => onDecrement(product.id, colisNum)}
  disabled={quantity === 0 || hasMultipleLocationsForColi}
>
  <Minus className="h-4 w-4" />
</Button>

{hasMultipleLocationsForColi && (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="text-xs text-orange-600">
          ⚠️ Dividido
        </span>
      </TooltipTrigger>
      <TooltipContent>
        Use os controlos por localização abaixo
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
)}

{/* Expandir automaticamente quando dividido */}
useEffect(() => {
  const dividedColis = product.colisDetails
    .filter(c => c.hasMultipleLocations)
    .map(c => c.colis_number);
  if (dividedColis.length > 0) {
    setExpandedColis(new Set(dividedColis));
  }
}, [product.colisDetails]);
```

### Modificação 2: ManualStockSection - Detectar colis divididos

Adicionar lógica para detectar se o produto a sair tem colis divididos:

```tsx
// Novo hook para buscar dados de localização
const [productLocations, setProductLocations] = useState<Record<string, ColisLocationData[]>>({});

// Ao confirmar saída, verificar se precisa selecção de localização
const handleValidateExit = async (item: MovementItem) => {
  const { data: counts } = await supabase
    .from('counts')
    .select('*')
    .eq('product_id', item.product_id);
  
  // Agrupar por colis_number
  const colisCounts = groupBy(counts, 'colis_number');
  
  // Verificar se algum colis tem múltiplas localizações
  const dividedColis = Object.entries(colisCounts)
    .filter(([_, entries]) => entries.filter(e => e.quantity > 0).length > 1);
  
  if (dividedColis.length > 0) {
    // Abrir dialog de selecção de localização
    setLocationSelectionProduct(item);
    return;
  }
  
  // Sem divisões, proceder normalmente
  confirmExit(item);
};
```

### Modificação 3: Novo componente - LocationSelectionDialog.tsx

Dialog para seleccionar de qual localização retirar stock:

```tsx
interface LocationSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName: string;
  quantity: number; // Quantidade de sets a retirar
  totalColis: number;
  colisData: {
    colisNumber: number;
    entries: { countId: string; quantity: number; location: string; pallet: string }[];
  }[];
  onConfirm: (selections: { colisNumber: number; countId: string; quantity: number }[]) => void;
}

export function LocationSelectionDialog({...}: LocationSelectionDialogProps) {
  // Para cada colis, permitir escolher de qual localização tirar
  const [selections, setSelections] = useState<Record<number, { countId: string; quantity: number }>>({});

  return (
    <Dialog>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Seleccionar Localização para Saída</DialogTitle>
          <DialogDescription>
            Este produto está dividido em múltiplas localizações.
            Seleccione de onde retirar {quantity} set(s).
          </DialogDescription>
        </DialogHeader>
        
        {colisData.map(colis => (
          <div key={colis.colisNumber} className="space-y-2">
            <Label>Coli {colis.colisNumber}/{totalColis}</Label>
            
            {colis.entries.map(entry => (
              <div 
                key={entry.countId}
                className={cn(
                  "p-3 rounded-lg border cursor-pointer",
                  selections[colis.colisNumber]?.countId === entry.countId 
                    && "border-primary bg-primary/5"
                )}
                onClick={() => setSelections(prev => ({
                  ...prev,
                  [colis.colisNumber]: { countId: entry.countId, quantity: quantity }
                }))}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    <span>{entry.location || 'Sem localização'}</span>
                    {entry.pallet && (
                      <>
                        <Box className="h-4 w-4 ml-2" />
                        <span>{entry.pallet}</span>
                      </>
                    )}
                  </div>
                  <Badge variant="secondary">
                    {entry.quantity} disponível
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        ))}
        
        <DialogFooter>
          <Button onClick={() => onConfirm(Object.entries(selections).map(...))} >
            Confirmar Saída
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### Modificação 4: Novo componente - EntryLocationDialog.tsx

Dialog para seleccionar destino de entrada:

```tsx
interface EntryLocationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName: string;
  quantity: number;
  totalColis: number;
  existingLocations: { location: string; pallet: string }[];
  onConfirm: (destination: {
    type: 'existing' | 'new';
    location?: string;
    pallet?: string;
  }) => void;
}

export function EntryLocationDialog({...}: EntryLocationDialogProps) {
  const [destinationType, setDestinationType] = useState<'existing' | 'new'>('existing');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newPallet, setNewPallet] = useState('');

  return (
    <Dialog>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Destino da Entrada</DialogTitle>
          <DialogDescription>
            Seleccione onde armazenar os {quantity} set(s) de {productName}.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Opção: Localização Existente */}
          {existingLocations.length > 0 && (
            <div>
              <RadioGroup value={destinationType} onValueChange={setDestinationType}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="existing" id="existing" />
                  <Label htmlFor="existing">Adicionar a localização existente</Label>
                </div>
              </RadioGroup>
              
              {destinationType === 'existing' && (
                <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar localização..." />
                  </SelectTrigger>
                  <SelectContent>
                    {existingLocations.map(loc => (
                      <SelectItem 
                        key={`${loc.location}-${loc.pallet}`} 
                        value={`${loc.location}|${loc.pallet}`}
                      >
                        {loc.location} {loc.pallet && `(${loc.pallet})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
          
          {/* Opção: Nova Localização */}
          <div>
            <RadioGroup value={destinationType} onValueChange={setDestinationType}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="new" id="new" />
                <Label htmlFor="new">Nova localização</Label>
              </div>
            </RadioGroup>
            
            {destinationType === 'new' && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div>
                  <Label className="text-xs">Palete (opcional)</Label>
                  <PalletSelect
                    value={newPallet}
                    onValueChange={(val, derivedLoc) => {
                      setNewPallet(val);
                      if (derivedLoc) setNewLocation(derivedLoc);
                    }}
                  />
                </div>
                <div>
                  <Label className="text-xs">Localização</Label>
                  <LocationSelect
                    value={newLocation}
                    onValueChange={setNewLocation}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
        
        <DialogFooter>
          <Button onClick={() => onConfirm({
            type: destinationType,
            location: destinationType === 'new' ? newLocation : selectedLocation.split('|')[0],
            pallet: destinationType === 'new' ? newPallet : selectedLocation.split('|')[1],
          })}>
            Confirmar Entrada
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### Modificação 5: StockExitsView.tsx - Integrar selecção de localização

```tsx
// Estado para o dialog
const [locationSelectionData, setLocationSelectionData] = useState<{
  item: MovementItem;
  colisData: ColisLocationData[];
} | null>(null);

// Antes de confirmar saída, verificar se precisa selecção
const handleFinalConfirm = async () => {
  for (const item of detailedPickingItems) {
    // Verificar se algum colis tem múltiplas localizações com stock
    const dividedColis = item.colisDetails
      .filter(c => c.hasMultipleLocations && c.locationEntries.filter(e => e.quantity > 0).length > 1);
    
    if (dividedColis.length > 0) {
      // Precisa seleccionar localização
      setLocationSelectionData({
        item: item,
        colisData: dividedColis
      });
      return; // Parar e aguardar selecção
    }
  }
  
  // Sem divisões, proceder normalmente
  executeExits();
};

// Callback após selecção
const handleLocationSelected = (selections: LocationSelection[]) => {
  // Aplicar as selecções e decrementar dos counts específicos
  // ...
};
```

### Modificação 6: StockEntriesView.tsx - Integrar selecção de destino

```tsx
// Estado para o dialog
const [entryLocationData, setEntryLocationData] = useState<{
  item: MovementItem;
  existingLocations: { location: string; pallet: string }[];
} | null>(null);

// Antes de confirmar entrada, verificar se produto tem localizações existentes
const handleConfirm = async () => {
  for (const item of allItems) {
    // Buscar localizações existentes do produto
    const { data: counts } = await supabase
      .from('counts')
      .select('location, pallet_number')
      .eq('product_id', item.product_id)
      .gt('quantity', 0);
    
    const uniqueLocations = [...new Map(
      (counts || [])
        .filter(c => c.location)
        .map(c => [`${c.location}-${c.pallet_number}`, c])
    ).values()];
    
    // Se tem localizações e mais de 1, perguntar onde colocar
    if (uniqueLocations.length > 1) {
      setEntryLocationData({
        item,
        existingLocations: uniqueLocations.map(c => ({
          location: c.location || '',
          pallet: c.pallet_number || ''
        }))
      });
      return; // Parar e aguardar selecção
    }
  }
  
  // Sem múltiplas localizações, proceder normalmente
  executeEntries();
};
```

---

## Ficheiros a Modificar/Criar

| Ficheiro | Tipo | Alteração |
|----------|------|-----------|
| `src/components/counting/ProductCard.tsx` | Modificar | Desactivar botões +/- quando coli dividido, expandir automaticamente |
| `src/components/stock/ManualStockSection.tsx` | Modificar | Detectar colis divididos antes de confirmar |
| `src/components/stock/StockExitsView.tsx` | Modificar | Integrar dialog de selecção de localização |
| `src/components/stock/StockEntriesView.tsx` | Modificar | Integrar dialog de selecção de destino |
| `src/components/stock/LocationSelectionDialog.tsx` | Criar | Dialog para escolher localização de saída |
| `src/components/stock/EntryLocationDialog.tsx` | Criar | Dialog para escolher destino de entrada |

---

## Resultado Esperado

1. **ProductCard melhorado**:
   - Botões +/- do coli principal desactivados quando dividido
   - Colis divididos expandem automaticamente
   - Controlos por localização permanecem funcionais

2. **Saídas inteligentes**:
   - Sistema detecta colis divididos
   - Utilizador escolhe de qual localização tirar
   - Stock decrementado da localização correcta

3. **Entradas inteligentes**:
   - Sistema detecta se produto tem múltiplas localizações
   - Utilizador escolhe: localização existente OU nova
   - Se nova: pode seleccionar palete (opcional) e/ou localização
   - Stock adicionado à localização escolhida

4. **Paletes opcionais**:
   - Todos os selects de palete permitem deixar vazio
   - Localização pode ser seleccionada independentemente do palete

