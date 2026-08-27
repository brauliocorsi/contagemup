# Adicionar notas a uma rota em rascunho

Dentro do ecrã de uma rota ainda **planeada (rascunho)**, poder acrescentar novas notas de encomenda procurando pelo número de encomenda diretamente na Gestão Click.

## Como vai funcionar

- No ecrã da rota, quando o estado é "Planeada", aparece um bloco "Adicionar nota" com um campo para escrever o número da encomenda (ex.: `12345`) e um botão "Procurar".
- A pesquisa vai à Gestão Click e devolve a encomenda: código, cliente, morada, data de entrega e situação. Se não existir, mostra "Encomenda não encontrada".
- Antes de deixar adicionar, valida automaticamente:
  - se a nota já está nesta rota → avisa e não duplica;
  - se a nota está noutra rota **ativa** (planeada ou em curso) → mostra o nome dessa rota e bloqueia a adição;
  - se só consta de rotas concluídas/canceladas → deixa adicionar normalmente.
- Ao confirmar, a nota entra como última paragem da rota (a ordenação manual continua disponível) e a lista, seleção, impressão, picking e guias passam a incluí-la.
- Em rotas "Em curso", "Concluída" ou "Cancelada" o bloco de adição não aparece.
- Permite escrever vários números separados por vírgula/espaço numa só pesquisa, processando cada um com a mesma validação.

## Notas técnicas

- Nova ação `order-by-code` na Edge Function `logistics-gc`: recebe um ou mais códigos, procura a venda por `codigo` percorrendo páginas de `/vendas` (mesma estratégia já usada em `gestaoclick-venda-detail`), e devolve os campos do `SepOrder` (id, codigo, cliente, morada, entrega, situacao). Wrapper novo em `src/lib/logistics/api.ts`.
- Novo hook `useAddRouteStops` em `src/hooks/useRoutes.tsx`: insere em `route_stops` com `order_number` a seguir ao máximo atual, reutilizando `findActiveRouteConflicts` para a validação e invalidando `['route', id]` e `['routes']`.
- Novo componente `src/components/logistics/AddRouteStopDialog.tsx` (ou bloco inline em `RouteDetailView.tsx`) com o campo de pesquisa, pré-visualização do resultado e avisos de conflito.
- `RouteDetailView.tsx`: mostra o bloco apenas quando `route.status === 'pending'`; após adicionar, os documentos da Gestão Click são recarregados para as novas paragens.
- Sem alterações de base de dados.
