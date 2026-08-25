# Fluxo de entrada: conferência → arrumação

Objetivo: o material entra numa localização de **conferência** (receção) e só depois é arrumado na localização final de stock, com rastreio de tudo o que está pendente de arrumação.

## Como vai funcionar

1. **Entrada** (scanner, entradas manuais e entradas por compra do ERP): a localização vem preenchida por defeito com a zona de conferência configurada. O operador pode alterar para outra localização se quiser dar entrada direta.
2. **Pendente de arrumação**: tudo o que está numa localização de conferência aparece numa lista de pendentes (no dashboard e no scanner), com produto, coli, quantidade e há quanto tempo lá está.
3. **Arrumação**:
   - No scanner: novo módulo "Arrumação" — ler o produto (ou coli), escolher a quantidade e ler a localização de destino. Confirma e move.
   - No dashboard: painel com a lista de pendentes e escolha da localização de destino por linha, com ação em lote.
4. **Bloqueio**: stock em conferência não conta como disponível para picking — o scanner recusa picking desses itens (mesma regra já usada para cais/pré-saída), com mensagem a pedir que o material seja arrumado primeiro.

## Configuração

- Nas Localizações passa a existir o tipo **"Conferência (receção)"**, ao lado de Stock, Pré-saída, Transporte e Quarentena.
- Podem existir várias zonas de conferência (ex.: CONF, CONF-2). A primeira por ordem de código é a sugerida por defeito nas entradas.
- As zonas de conferência aparecem no mapa de armazém como zonas próprias, com contagem de itens.

## Detalhes técnicos

**Base de dados**
- Migração: alargar `warehouse_locations.location_type` para aceitar `conferencia` (atualizar a constraint de valores permitidos). Sem novas tabelas.
- Criar/garantir a localização `CONF` com `location_type = 'conferencia'` (a existente é convertida se já houver).
- Nenhuma alteração às RPCs `register_entry`, `move_stock_qty` ou `transfer_stock_location` — a arrumação usa `transfer_stock_location` (por `count_id`) no dashboard e `move_stock_qty` no scanner.

**Frontend**
- `src/hooks/useWarehouseConfig.tsx`: adicionar `'conferencia'` a `LocationType` e a `LOCATION_TYPE_LABELS`; `LocationsConfig.tsx` ganha a nova opção e a respetiva descrição.
- `src/hooks/useDeliveryNotes.tsx` (`useTypedLocations`): aceitar também `'conferencia'`.
- Novo hook `useReceivingLocations` para obter as zonas de conferência e a predefinida.
- `src/components/scanner/EntryModule.tsx`: substituir a constante fixa `CONF` pela zona de conferência configurada, mantendo a possibilidade de escolher outra.
- `src/components/stock/StockEntriesView.tsx` e `src/components/stock/PurchaseEntryView.tsx`: pré-preencher a localização com a zona de conferência.
- Novo `src/components/scanner/PutawayModule.tsx` (Arrumação) registado em `src/pages/ScannerApp.tsx` com ícone no menu do scanner; fluxo: ler produto/coli em conferência → quantidade → ler destino → confirmar; limpa o estado após cada arrumação.
- Novo painel de pendentes reutilizando/estendendo `src/components/stock/UnlocatedStockPanel.tsx` para incluir também as zonas `conferencia` (hoje só considera `is_staging`), com destino por linha e ação em lote.
- `src/hooks/usePickingStockLocations.tsx`: tratar `conferencia` como não-stock para o bloqueio de picking já existente.
- `src/components/warehouse/InteractiveWarehouseMap.tsx`: mostrar as zonas de conferência na secção de zonas livres, identificadas como receção.
