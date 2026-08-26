# Etiquetas: data de entrada e colis no formato 1/2

## Objetivo
Uniformizar todas as etiquetas impressas no sistema:
- Nunca mostrar localidades.
- Mostrar sempre a data da última entrada de stock do produto.
- Identificar sempre o coli no formato `1/2`, `2/2`.

## Regras finais das etiquetas
Conteúdo padrão de cada etiqueta de produto/coli:
- Nome do produto
- `Código: <código base>`
- `Coli 1/2` (número do coli sobre o total de colis do produto)
- `Entrada: dd/mm/aaaa` (data do último movimento de entrada desse produto; se nunca houve entrada, mostra `Entrada: —`)
- Código de barras com `CODIGO-C1`, `CODIGO-C2`, …

Sem localidade em nenhuma etiqueta. As etiquetas de prateleira/localidade (`LOC-…`) deixam de ser geradas: são removidas do centro de impressão do scanner, da consulta de produto, da conferência de entrada e das transferências.

## Onde se aplica
- Mapa do armazém (impressão por localidade, unidade a unidade)
- Lista de produtos: etiqueta individual e impressão em lote
- Scanner: centro de impressão, consulta de produto, entrada/conferência, transferências

## Detalhes técnicos
- `src/lib/scanner/labels.ts`: `LabelItem` passa a aceitar `entryDate?: string`; `productLabel`/`productColiLabels` recebem a data e o total de colis, e geram `Coli n/total` + `Entrada: …`. Remover `printCommandSheet`? Não — a folha de comandos mantém-se inalterada (não é etiqueta de produto).
- Novo helper `src/lib/scanner/entryDates.ts` (hook `useLastEntryDates`) que busca, com paginação, o `max(created_at)` de `stock_movements` com `movement_type = 'entrada'` por `product_id`, devolvendo um mapa `product_id -> data`. Usado pelos ecrãs que imprimem etiquetas.
- `InteractiveWarehouseMap.tsx`: `buildLocationUnitLabels` deixa de incluir `Local: …`, passa a `Coli n/total` e `Entrada: …`; o diálogo carrega as datas de entrada dos produtos da localidade antes de imprimir.
- `BulkLabelPrintButton.tsx` e `ProductLabelPrintButton.tsx`: incluem a data de entrada (mantendo a linha de stock no lote) e o formato `n/total`.
- `PrintCenterModule.tsx`: separador de localizações deixa de gerar etiquetas de localidade; produtos passam a ter data de entrada e `n/total`.
- `ProductInquiryModule.tsx`, `EntryModule.tsx`, `TransferModule.tsx`: remover as linhas de localidade e as etiquetas `LOC-…`, aplicar o novo formato.

Sem alterações à base de dados.
