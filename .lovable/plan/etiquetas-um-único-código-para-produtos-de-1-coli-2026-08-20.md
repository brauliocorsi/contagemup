# Etiquetas: um único código para produtos de 1 coli

## Problema

Para o produto 471723 (1 coli) o sistema gera duas etiquetas: `471723` e `471723-C1`.
Isto acontece porque há pontos onde a etiqueta "do produto" e a etiqueta "por coli" são
somadas, e porque o sufixo `-C1` é aplicado mesmo quando só existe um coli.

Pontos identificados:

- Centro de Impressão (scanner) — no modo "por coli" gera sempre `CODIGO-Cn`, inclusive quando o total é 1.
- Consulta de Produto (scanner) — a lista de etiquetas junta a etiqueta do produto **mais** uma etiqueta por cada coli, duplicando quando só há um coli.
- O helper `productColiLabels` já trata isto bem (com 1 coli devolve apenas o código do produto) — serve de regra de referência.

## Regra a aplicar em todo o sistema

- Produto com **1 coli** → uma única etiqueta com o código do produto (sem `-C1`).
- Produto com **2+ colis** → uma etiqueta por coli (`CODIGO-C1`, `CODIGO-C2`, …), sem etiqueta extra "do produto".
- Antes de gerar o PDF, remover duplicados pelo mesmo código, para nunca sair a mesma etiqueta duas vezes.

## Alterações técnicas

1. `src/components/scanner/PrintCenterModule.tsx`
   - No modo "por coli": se o total efetivo de colis for 1, emitir uma linha com o código do produto puro em vez de `colisCode(code, 1)`.
2. `src/components/scanner/ProductInquiryModule.tsx`
   - Deixar de somar a etiqueta do produto às etiquetas por coli: se houver 2+ colis, apenas as etiquetas por coli; se houver 1 (ou nenhum registo), apenas a etiqueta do produto.
3. `src/lib/scanner/labels.ts`
   - Em `printLabels`, deduplicar a lista final por `code` (mantendo o maior número de cópias pedido), garantindo a regra em qualquer origem de impressão.

Sem alterações de base de dados; comportamento de impressão QL-700/A4/térmica mantém-se.
