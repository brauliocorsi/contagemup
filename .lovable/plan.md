

# Plano: Completar Sistema de Colis Incompletos e Relatórios

## Estado Actual - CONCLUÍDO ✅

Todas as funcionalidades principais foram implementadas:

### ✅ 1. Toggle "Set Completo" / "Colis Individual" (Entradas e Saídas)
- **Ficheiros**: `ManualStockSection.tsx`, `StockEntriesView.tsx`, `StockExitsView.tsx`
- Interface com toggle para produtos multi-colis
- Modo Set Completo actualiza todos os colis com a mesma quantidade
- Modo Individual permite especificar quantidade por colis

### ✅ 2. Estatística de Colis Excedentes no CountingSummary
- **Ficheiro**: `src/components/counting/CountingSummary.tsx`
- Nova estatística "Colis Excedentes" mostra produtos desbalanceados
- Conta quantos produtos têm partes excedentes e total de partes soltas

### ✅ 3. Secção de Produtos Desbalanceados no StockIntegrityReport
- **Ficheiro**: `src/components/reports/StockIntegrityReport.tsx`
- Lista completa de produtos com colis desbalanceados
- Detalhe por colis mostrando quantidade e excedente (+X)
- Exportação Excel de colis incompletos
- Mostra localizações e sugere acções

### ✅ 4. Validação de Stock por Colis nas Saídas
- **Ficheiro**: `src/components/stock/StockExitsView.tsx`
- Verifica stock de CADA coli antes de permitir saída de set completo
- Mensagem clara indicando qual coli limita e quantos sets disponíveis
- Sugere ajustar quantidade ou mudar para modo individual

## Funcionalidades Opcionais (Futuro)

### Rastreabilidade de Origem (Opcional)
- Diferenciar contagens físicas (session_id não null) de entradas administrativas (session_id null)
- Mostrar origem visual na interface de contagem

```text
Produto: Estante Lino Rodi
┌─────────────────────────────────────────────────────┐
│  Coli 1: 12 un.  │  Coli 2: 10 un.  │  Coli 3: 10 un.
│  [📦 7 contagem] │  [📦 5 contagem] │  [📦 5 contagem]
│  [📥 5 entrada ] │  [📥 5 entrada ] │  [📥 5 entrada]
└─────────────────────────────────────────────────────┘
```

## Resumo das Alterações Implementadas

| Ficheiro | Alteração | Estado |
|----------|-----------|--------|
| `src/hooks/useStockMovements.tsx` | Campos `isCompleteSet`, `colisQuantities`, `totalColis` | ✅ |
| `src/components/stock/ManualStockSection.tsx` | Toggle Set/Individual + inputs por colis | ✅ |
| `src/components/stock/ColisQuantityInput.tsx` | Componente de input por colis | ✅ |
| `src/components/stock/StockEntriesView.tsx` | Lógica de entrada por set/colis | ✅ |
| `src/components/stock/StockExitsView.tsx` | Validação e saída por set/colis | ✅ |
| `src/components/counting/CountingSummary.tsx` | Estatística de colis excedentes | ✅ |
| `src/components/reports/StockIntegrityReport.tsx` | Secção de produtos desbalanceados | ✅ |
