

## Plan: Selecao de palete/localizacao por coli na entrada de stock

### Problema actual
O dialogo `EntryLocationDialog` selecciona **um unico destino** para todo o produto. Todos os colis vao para o mesmo palete/localizacao. O utilizador quer poder escolher destinos diferentes para cada coli, ou manter o mesmo destino para todos.

### Abordagem

**1. Modificar `EntryLocationDialog`** para suportar produtos multi-coli:
- Adicionar um toggle: "Mesmo destino para todos" vs "Destino por coli"
- No modo "mesmo destino", funciona como hoje (um destino para tudo)
- No modo "por coli", mostrar a selecao de localização/palete para cada coli individualmente, com nome do coli se disponivel
- O resultado passa de um unico `EntryDestination` para um `Map<number, EntryDestination>` (colis_number -> destino)

**2. Modificar `StockEntriesView`** para usar destinos por coli:
- Alterar `pendingEntryDestinations` de `Map<string, EntryDestination>` para `Map<string, Map<number, EntryDestination>>` (product_id -> colis_number -> destino)
- No `executeEntries`, ao iterar pelos colis, consultar o destino especifico daquele coli
- Passar `totalColis`, `colisNames` e `categoryColisNamesMap` ao dialogo

**3. Manter compatibilidade total:**
- Produtos com 1 coli: comportamento identico ao actual
- Modo "mesmo destino": gera internamente o mesmo destino para todos os colis
- Sem "Especificar localizacao" activo e sem multiplas localizacoes: nenhum dialogo aparece (como hoje)

### Ficheiros a modificar
- `src/components/stock/EntryLocationDialog.tsx` -- adicionar UI per-coli com toggle
- `src/components/stock/StockEntriesView.tsx` -- adaptar state e logica de destinos por coli

### Riscos mitigados
- O modo "mesmo destino" e o default, mantendo o fluxo rapido para quem nao precisa separar
- Nenhuma alteracao na logica de `counts`, `ManualStockSection` ou outros hooks

