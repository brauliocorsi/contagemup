# Etiquetas coli a coli no mapa do armazém

## Objetivo
Ao imprimir etiquetas de uma localidade no mapa do armazém, cada etiqueta deve identificar sempre o coli, com o código no formato `CODIGO-C1`, `CODIGO-C2`, etc., mesmo quando o produto tem apenas um coli.

## Comportamento
- O botão de impressão da localidade continua a imprimir tudo de imediato (uma etiqueta por unidade existente), sem passo extra de seleção.
- Todos os códigos passam a incluir o sufixo do coli: `471723-C1`, `471723-C2`.
- Cada etiqueta continua a mostrar nome do produto, código base, número do coli e a localidade.

## Nota
Esta mudança aplica-se apenas à impressão a partir do mapa do armazém. O centro de impressão do scanner e o botão de etiqueta na lista de produtos mantêm a regra atual (produtos de 1 coli imprimem só o código base).

## Detalhes técnicos
- Ajustar `buildLocationUnitLabels` em `src/components/warehouse/InteractiveWarehouseMap.tsx`: gerar sempre `${code}-C${colisNumber}` em vez de usar o código base quando `colisNumber <= 1`.
- Manter a agregação por código (soma de `copies`) e o restante conteúdo da etiqueta inalterados.
