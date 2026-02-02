

# Melhoria Visual: Selecção de Localização por Coli

## Objectivo

Melhorar a apresentação visual dos colis nos dialogs de entrada e saída de stock para que o utilizador tenha informação clara e intuitiva sobre cada coli quando precisa seleccionar localizações.

---

## Situação Actual

Actualmente os dialogs mostram os colis de forma simples:
- "Coli 1/2" sem nome descritivo
- Cards de localização pequenos e pouco diferenciados
- Falta de hierarquia visual entre colis

---

## Proposta de Melhoria

### Novo Design Visual para Cada Coli

```text
┌──────────────────────────────────────────────────────────────────┐
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  📦 COLI 1 de 2 - Cabeceira                    [2/3 ✓]     │  │
│  │  ─────────────────────────────────────────────────────────  │  │
│  │                                                             │  │
│  │  ○ 📍 B3-01  |  📦 PLT-052  |  6 un. disponível       [+]  │  │
│  │                                                             │  │
│  │  ● 📍 C12-02  |  📦 PLT-089  |  3 un. disponível      [2] │  │
│  │                                                  ↑ retirar  │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  📦 COLI 2 de 2 - Ilhargueiro                  [0/3 ⚠]     │  │
│  │  ─────────────────────────────────────────────────────────  │  │
│  │                                                             │  │
│  │  ● 📍 B3-01  |  📦 PLT-052  |  3 un. disponível      [3]  │  │
│  │                                                             │  │
│  │  ○ 📍 C12-02  |              |  3 un. disponível       [+] │  │
│  │                 sem palete                                  │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### Elementos Visuais a Implementar

1. **Card por Coli com Destaque**
   - Fundo colorido diferenciado por estado (verde = completo, laranja = pendente)
   - Header proeminente com número do coli e nome descritivo
   - Badge de progresso (X/Y seleccionado)

2. **Nome do Coli**
   - Exibir o nome da categoria (ex: "Cabeceira", "Ilhargueiro", "Base") quando disponível
   - Derivado da configuração da categoria (`colis_names`)

3. **Cards de Localização Melhorados**
   - Ícones coloridos e maiores
   - Separação clara entre localização e palete
   - Indicador visual claro de "sem palete" quando aplicável
   - Quantidade disponível bem destacada

4. **Indicadores de Estado**
   - Checkmark verde quando coli está completo
   - Aviso laranja quando falta seleccionar
   - Números de progresso sempre visíveis

---

## Detalhes Técnicos

### Modificação 1: LocationSelectionDialog.tsx (Saídas)

**Estrutura proposta para cada coli:**

```tsx
// Header do coli com design destacado
<div className="rounded-lg border-2 overflow-hidden mb-4">
  {/* Header colorido */}
  <div className={cn(
    "px-4 py-3 flex items-center justify-between",
    isColisComplete 
      ? "bg-green-50 border-b-2 border-green-200" 
      : "bg-amber-50 border-b-2 border-amber-200"
  )}>
    <div className="flex items-center gap-3">
      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
        <Package className="h-5 w-5 text-primary" />
      </div>
      <div>
        <div className="flex items-center gap-2">
          <span className="font-bold text-lg">
            Coli {colisNumber}
          </span>
          <span className="text-muted-foreground">
            de {totalColis}
          </span>
        </div>
        {colisName && (
          <span className="text-sm text-muted-foreground">
            {colisName}
          </span>
        )}
      </div>
    </div>
    
    {/* Badge de progresso */}
    <Badge className={cn(
      "text-base px-3 py-1",
      isColisComplete 
        ? "bg-green-600" 
        : "bg-amber-500"
    )}>
      {isColisComplete ? (
        <><Check className="h-4 w-4 mr-1.5" /> {selected}/{needed}</>
      ) : (
        <><AlertCircle className="h-4 w-4 mr-1.5" /> {selected}/{needed}</>
      )}
    </Badge>
  </div>
  
  {/* Corpo com opções de localização */}
  <div className="p-3 space-y-2 bg-white">
    {entries.map(entry => (
      <LocationCard entry={entry} ... />
    ))}
  </div>
</div>
```

**Card de localização melhorado:**

```tsx
<div className={cn(
  "p-4 rounded-lg border-2 cursor-pointer transition-all",
  isSelected 
    ? "border-primary bg-primary/5 shadow-sm" 
    : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
)}>
  <div className="flex items-center justify-between">
    {/* Info da localização */}
    <div className="flex items-center gap-4">
      {/* Ícone de localização */}
      <div className={cn(
        "h-10 w-10 rounded-lg flex items-center justify-center",
        entry.location ? "bg-blue-100" : "bg-gray-100"
      )}>
        <MapPin className={cn(
          "h-5 w-5",
          entry.location ? "text-blue-600" : "text-gray-400"
        )} />
      </div>
      
      {/* Detalhes */}
      <div className="space-y-0.5">
        <div className="font-medium text-base">
          {entry.location || 'Sem localização'}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {entry.pallet_number ? (
            <span className="flex items-center gap-1">
              <Box className="h-3.5 w-3.5" />
              {entry.pallet_number}
            </span>
          ) : (
            <span className="italic text-gray-400">Sem palete</span>
          )}
        </div>
      </div>
    </div>
    
    {/* Quantidade e input */}
    <div className="flex items-center gap-3">
      <Badge variant="secondary" className="text-sm px-2.5 py-1">
        {entry.quantity} disponível
      </Badge>
      
      {isSelected && (
        <div className="flex items-center gap-2 bg-white rounded-md border px-2 py-1">
          <Label className="text-xs font-medium text-muted-foreground">
            Retirar:
          </Label>
          <Input
            type="number"
            min="1"
            max={entry.quantity}
            value={selection.quantity}
            className="h-8 w-16 text-center font-semibold"
          />
        </div>
      )}
    </div>
  </div>
</div>
```

### Modificação 2: EntryLocationDialog.tsx (Entradas)

**Adicionar suporte para colis_names e melhorar visualização:**

```tsx
// Props expandidas para incluir nome do coli
interface EntryLocationDialogProps {
  // ... props existentes ...
  totalColis?: number;
  currentColisNumber?: number;
  colisName?: string | null;
}

// Header melhorado
<DialogHeader>
  <DialogTitle className="flex items-center gap-3">
    <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
      <Plus className="h-5 w-5 text-green-600" />
    </div>
    <div>
      <span>Destino da Entrada</span>
      {totalColis && totalColis > 1 && (
        <div className="text-sm font-normal text-muted-foreground mt-0.5">
          Coli {currentColisNumber} de {totalColis}
          {colisName && <span className="ml-1">- {colisName}</span>}
        </div>
      )}
    </div>
  </DialogTitle>
</DialogHeader>
```

---

## Ficheiros a Modificar

| Ficheiro | Alteração |
|----------|-----------|
| `src/components/stock/LocationSelectionDialog.tsx` | Redesign visual completo com cards destacados por coli, nomes descritivos, ícones maiores e indicadores de progresso melhorados |
| `src/components/stock/EntryLocationDialog.tsx` | Adicionar suporte para exibir nome do coli, melhorar visualização das opções de localização |

---

## Resultado Esperado

1. **Hierarquia visual clara** - Cada coli num card separado e bem identificado
2. **Nomes descritivos** - "Cabeceira", "Ilhargueiro", etc. quando configurados na categoria
3. **Ícones intuitivos** - Maiores e coloridos para fácil identificação
4. **Indicadores de progresso** - O utilizador sabe imediatamente o que já seleccionou e o que falta
5. **Distinção "sem palete"** - Texto claro quando não há palete, em vez de vazio
6. **Feedback de estado** - Cards mudam de cor quando completos (verde) ou pendentes (laranja)

