# Importar ficheiro de picking nas Saídas

Adicionar um botão "Importar ficheiro" no ecrã de Saídas que lê um Excel/CSV (como o picking exportado), valida cada linha contra o sistema e monta o carrinho de saída automaticamente.

## Como vai funcionar

1. Botão **Importar ficheiro** no topo das Saídas (drag & drop ou seleção).
2. Leitura das colunas: **Código**, **Nome do Produto**, **Quantidade** (com deteção automática de nomes de coluna). Quando existe a coluna "Detalhes", só as linhas marcadas como *stock* seguem para o carrinho; as *encomendar* aparecem numa lista informativa separada.
3. O número de encomenda de cada linha é guardado como referência daquele produto na saída.
4. Ecrã de revisão com 4 grupos:
   - **Prontos** — produto identificado e com stock suficiente.
   - **Stock insuficiente** — identificado, mas disponível < pedido (mostra pedido vs. disponível; permite exportar na quantidade possível).
   - **Não registados** — produto não existe no sistema; botão "Criar produto" ao lado de cada linha para cadastro rápido (código, nome, categoria, nº de colis) e revalidação imediata.
   - **Ambíguos** — mais do que um produto compatível pelo nome; escolha manual numa lista.
5. Botão "Adicionar ao carrinho" transfere as linhas resolvidas para o carrinho existente, mantendo toda a lógica atual (colis, localizações prioritárias, saída parcial, `commit_exit_cart`).

## Validação forte (código + nome)

Ordem de correspondência para cada linha:

1. Código exato (após limpeza de espaços/caracteres invisíveis).
2. Código presente no fim do nome (ex.: `... - 7832BO`, `... - 5902928875072`) — extraído por padrão e comparado com os códigos do sistema.
3. Nome normalizado exato (minúsculas, sem acentos, sem pontuação/espaços duplicados).
4. Nome normalizado sem medidas/variações (tolerância a `0,45x0,38x0,34`, espaços duplos).
5. Correspondência parcial forte — se der um único resultado, aceita; se der vários, marca como **ambíguo**; nenhum, marca **não registado**.

Linhas duplicadas do mesmo produto são somadas (quantidades agregadas, referências concatenadas).

## Detalhes técnicos

- Novo `src/lib/stock/pickingImport.ts`: parsing (reutiliza `loadXLSX` e a deteção de colunas de `src/lib/reconciliation/fileParser.ts`), normalização de nomes, extração de código embutido e o algoritmo de matching contra a lista de `products` já carregada por `useProducts`.
- Novo `src/components/stock/ImportExitsDialog.tsx`: upload, pré-visualização agrupada, criação rápida de produto (via `createProduct` do `useProducts`) e devolução das linhas resolvidas.
- `StockExitsView.tsx`: botão de importação e injeção das linhas no carrinho pelo mecanismo `externalAdd` já existente, preenchendo quantidade e referência por produto.
- Disponibilidade calculada a partir do `current_stock` (sets) e dos `counts`, tal como o carrinho já faz — sem alterações no backend nem nas RPCs.
