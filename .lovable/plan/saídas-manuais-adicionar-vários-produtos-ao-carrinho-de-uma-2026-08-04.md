# Saídas manuais: adicionar vários produtos ao carrinho de uma vez

## Situação atual

O ecrã de saídas manuais já tem um carrinho e um botão único "Concluir e retirar do stock", mas o seletor de produtos fecha-se e limpa a pesquisa a cada produto escolhido. Na prática obriga a: abrir pesquisa → escrever → escolher 1 produto → fechar → repetir. É isso que dá a sensação de "só item a item".

## O que vai mudar

1. **A pesquisa fica aberta enquanto se adicionam produtos**
   - Ao clicar num resultado, o produto entra no carrinho e a lista continua aberta com o texto pesquisado intacto, pronto para o produto seguinte.
   - Fecha-se apenas quando o utilizador clicar fora ou em "Fechar".

2. **Feedback imediato na lista de resultados**
   - Produtos já no carrinho mostram um visto e a quantidade atual, em vez de só avisarem "já está no carrinho".
   - Clicar novamente num produto já adicionado incrementa a quantidade (em vez de não fazer nada).

3. **Adicionar por código / leitor de códigos**
   - Escrever um código e premir Enter adiciona diretamente o produto correspondente e limpa o campo, permitindo enfileirar leituras seguidas sem tocar no rato.

4. **Contador visível**
   - O botão de pesquisa e o cabeçalho passam a mostrar quantos produtos estão no carrinho, para confirmar que estão todos antes de concluir.

Nada muda na lógica de saída: continua a ser um único envio no fim, com a mesma seleção de localizações, motivo, referência e tratamento de saídas parciais.

## Detalhes técnicos

- Ficheiro: `src/components/stock/StockExitsView.tsx` (componente `ExitCart`).
- No `CommandItem.onSelect`: remover `setPickerOpen(false)` e `setSearch('')`; passar `addProductToCart` a incrementar `setQuantity` quando o produto já existe.
- Adicionar `onKeyDown` no `CommandInput` para tratar Enter com correspondência exata de `code` (case-insensitive) → adicionar e limpar a pesquisa.
- Derivar um `Set` de `product_id` do carrinho para marcar os resultados já adicionados.
- Sem alterações a hooks, RPC (`commit_exit_cart`) ou base de dados.
