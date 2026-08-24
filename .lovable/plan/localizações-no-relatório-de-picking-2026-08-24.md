# Localizações no Relatório de Picking

Adicionar uma coluna **Localização** ao picking das Notas de Separação: no ecrã, na impressão A4 e no export Excel.

## Como funciona

- Ao gerar o picking, o sistema procura no armazém (tabela de contagens) as localizações onde cada artigo tem stock, usando o código do produto do ERP.
- Cada linha mostra as localizações com stock, no formato `C6 (2), A3 (1)` — localização e quantidade disponível.
- Artigos sem correspondência no armazém ou sem stock localizado mostram `—`.
- As localizações aparecem também na folha impressa e na exportação Excel.

## Detalhes técnicos

1. Novo hook/consulta em `SeparationNotesView.tsx`: após `buildPicking`, procurar em `products` por `code` (e `supplier_code` como alternativa) os códigos das linhas de picking, depois carregar `counts` (product_id, location, quantity) desses produtos, agregando por localização e somando quantidades de todos os colis.
2. Estender `PickingLine` em `src/lib/logistics/picking.ts` com um campo opcional `localizacoes: string` e incluí-lo em `exportPickingXlsx` (nova coluna "Localização").
3. Adicionar a coluna à tabela do ecrã (entre Detalhes e Encomendas) e a `PickingReport.tsx` (coluna A4, mantendo o layout denso).
4. A busca de localizações é feita em lotes com `.range()` para respeitar o limite de 1000 linhas.
