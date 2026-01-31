

# Plano: Completar Sistema de Colis Incompletos e Relatórios

## Estado Actual

A base está implementada:
- Toggle "Set Completo" / "Colis Individual" funciona
- Entradas e saídas actualizam counts por colis
- Sincronização de dados históricos existe

## O Que Falta Implementar

### 1. Mostrar Colis Incompletos no CountingSummary

**Ficheiro**: `src/components/counting/CountingSummary.tsx`

Adicionar estatística de "Colis Excedentes" - partes que sobram e não formam sets:

```text
┌──────────────────────────────────────────────────────────────────────┐
│  Resumo da Contagem                                                  │
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐
│  │  120   │  │  450   │  │  98    │  │  12    │  │  10    │  │  25    │
│  │ Total  │  │ Sets   │  │ 100%   │  │ Pend.  │  │ N/Cont │  │ Colis  │
│  │Produtos│  │Completo│  │  OK    │  │        │  │        │  │Sobra   │ <-- NOVO
│  └────────┘  └────────┘  └────────┘  └────────┘  └────────┘  └────────┘
└──────────────────────────────────────────────────────────────────────┘
```

Lógica para calcular colis excedentes:
```typescript
// Para cada produto multi-colis
const excessColis = products.reduce((sum, p) => {
  if (p.total_colis <= 1) return sum;
  // Diferença entre max e min dos colis
  const max = Math.max(...p.colisQuantities);
  const min = Math.min(...p.colisQuantities); // = completeSets
  return sum + (max - min) * p.total_colis;
}, 0);
```

### 2. Detalhe de Colis Incompletos no StockIntegrityReport

**Ficheiro**: `src/components/reports/StockIntegrityReport.tsx`

Adicionar secção que mostra produtos com colis desbalanceados:

```text
┌──────────────────────────────────────────────────────────────────────┐
│  ⚠️ Produtos com Colis Desbalanceados (5)                           │
│  ──────────────────────────────────────────────────────────────────  │
│  │ EST-001 │ Estante Lino Rodi │ Coli1: 12 │ Coli2: 10 │ Coli3: 10 │ │
│  │         │                   │    +2     │           │           │ │
│  ├─────────┼───────────────────┼───────────┼───────────┼───────────┤ │
│  │ CAM-002 │ Cama Articulada   │ Coli1: 8  │ Coli2: 5  │ Coli3: 8  │ │
│  │         │                   │    +3     │   Base    │    +3     │ │
│  └─────────┴───────────────────┴───────────┴───────────┴───────────┘ │
│                                                                      │
│  [Exportar Colis Incompletos]                                        │
└──────────────────────────────────────────────────────────────────────┘
```

### 3. Validação de Stock por Colis nas Saídas

**Ficheiro**: `src/components/stock/StockExitsView.tsx`

Para modo "Set Completo", validar que TODOS os colis têm stock suficiente:

```typescript
// Buscar quantidade actual de cada colis
const colisStockCheck = await Promise.all(
  Array.from({ length: totalColis }, async (_, i) => {
    const colisNumber = i + 1;
    const { data } = await supabase
      .from('counts')
      .select('quantity')
      .eq('product_id', productId)
      .eq('colis_number', colisNumber);
    return { colisNumber, stock: data?.reduce((s, c) => s + c.quantity, 0) || 0 };
  })
);

const minStock = Math.min(...colisStockCheck.map(c => c.stock));
if (requestedQty > minStock) {
  // Erro: mostrar qual colis limita
}
```

### 4. Identificar Origem das Entradas na Contagem

**Ficheiro**: `src/hooks/useCounting.tsx` + UI

Diferenciar visualmente:
- Contagens físicas (session_id não null)
- Entradas administrativas (session_id null)

```text
Produto: Estante Lino Rodi
┌─────────────────────────────────────────────────────┐
│  Coli 1: 12 un.  │  Coli 2: 10 un.  │  Coli 3: 10 un.
│  [📦 7 contagem] │  [📦 5 contagem] │  [📦 5 contagem]
│  [📥 5 entrada ] │  [📥 5 entrada ] │  [📥 5 entrada]
└─────────────────────────────────────────────────────┘
```

## Ficheiros a Modificar

| Ficheiro | Alteração |
|----------|-----------|
| `src/components/counting/CountingSummary.tsx` | Adicionar estatística de colis excedentes |
| `src/components/reports/StockIntegrityReport.tsx` | Secção de produtos desbalanceados |
| `src/hooks/useCounting.tsx` | Buscar detalhes de origem (session vs admin) |
| `src/components/counting/ProductCard.tsx` | Mostrar origem visual das quantidades |
| `src/components/stock/StockExitsView.tsx` | Validação de stock por colis |

## Interface de Colis Desbalanceados

Novo componente ou secção no relatório que mostra:

1. **Lista de produtos** onde `max(colis) != min(colis)`
2. **Detalhe por colis** mostrando quantidade e diferença
3. **Sugestão de acção**: "Faltam 2 un. do Coli 2 para completar mais 2 sets"
4. **Exportação**: Excel com lista de colis em falta

## Fluxo de Validação de Saídas

```text
SAÍDA DE 5 SETS COMPLETOS:

1. Utilizador seleciona produto e quantidade 5
2. Sistema verifica stock de cada colis:
   - Coli 1: 12 ✓ (>= 5)
   - Coli 2: 10 ✓ (>= 5)
   - Coli 3: 3  ✗ (< 5) ← BLOQUEIO

3. Erro: "Só há 3 sets completos disponíveis (Coli 3 limita)"
4. Opções:
   - Ajustar para 3 sets
   - Mudar para modo individual
```

## Resumo das Alterações

### Fase 1: Estatísticas (Rápido)
- Actualizar `CountingSummary` com contagem de colis excedentes
- Adicionar secção de desbalanceamento no `StockIntegrityReport`

### Fase 2: Validação de Saídas
- Verificar stock por colis antes de permitir saída
- Mostrar qual colis está a limitar

### Fase 3: Rastreabilidade (Opcional)
- Diferenciar contagens físicas de entradas administrativas
- Mostrar origem na interface de contagem

