# Rotas — ambiente dedicado a partir das Notas de Separação

Criar rotas a partir das notas selecionadas e um ecrã próprio onde tudo o que hoje está espalhado (impressão em série, relatório de picking, emissão de guias) passa a ser feito no contexto daquela rota.

## 1. Botão "Criar Rota" nas Notas de Separação

- Novo botão junto ao de rota do Google Maps, ativo quando há notas selecionadas.
- Ao clicar abre um diálogo: nome da rota (sugestão automática com a data de entrega), data agendada, morada de partida (pré-preenchida com a atual) e matrícula.
- Validação antes de gravar: verifica se alguma nota selecionada já pertence a uma rota **ativa** (planeada/em curso). Se sim, lista as notas e as rotas onde estão e bloqueia a criação até serem retiradas da seleção. Notas que só constem de rotas já concluídas passam sem impedimento.
- Ao confirmar, grava a rota e as respetivas paragens (uma por nota: cliente, morada, código da encomenda) e navega para o ecrã da rota.

## 2. Novo menu "Rotas"

- Entrada nova na barra lateral, na secção de Logística.
- Lista de rotas com nome, data, número de paragens, estado (planeada, em curso, concluída) e acesso ao detalhe.
- Ações na lista: abrir, mudar estado, eliminar.

## 3. Ecrã da rota (ambiente dedicado)

Cabeçalho com nome, data, estado, morada de partida, matrícula e totais (nº de notas, nº de artigos).

Tabela de paragens da rota, com checkbox por nota (seleção parcial permitida), ordem da paragem, código, cliente, morada, situação e guia já emitida. Permite reordenar paragens e remover notas da rota.

Barra de ações aplicada às notas selecionadas dentro da rota:

- **Imprimir documentos em série** — mesmo comportamento atual (nº de cópias por nota, impressão A4).
- **Relatório de picking** — gera as linhas de picking com localizações, agrupamento por categoria, exportar Excel, imprimir e enviar para o Picking do Scanner.
- **Emitir guias** — morada de partida, matrícula, data/hora de carga, aviso de reemissão quando já existe guia, impressão das guias.
- **Abrir rota no Google Maps** — usa a ordem das paragens definida na rota.

## Notas técnicas

- Persistência nas tabelas existentes `route_schedules` e `route_stops` (`venda_id`, `venda_codigo`, `client_name`, `address`, `order_number`, `status`); não são necessárias alterações de base de dados.
- A validação de duplicados consulta `route_stops` por `venda_id` juntando `route_schedules` com estado diferente de concluída/cancelada.
- Novo hook `useRoutes` (listar, criar com paragens, atualizar estado, reordenar, remover paragem, eliminar rota) com invalidação de cache.
- Extrair a lógica hoje dentro de `SeparationNotesView.tsx` (impressão de documentos, picking, guias) para componentes/hook partilhados, reutilizados tanto nas Notas de Separação como no ecrã da rota — sem alterar o comportamento existente.
- Detalhes das encomendas na rota são recarregados da Gestão Click por `venda_id` ao abrir o ecrã (as tabelas guardam apenas a identificação da nota).
- Novos ficheiros: `src/components/logistics/RoutesView.tsx`, `RouteDetailView.tsx`, `CreateRouteDialog.tsx`, `src/hooks/useRoutes.tsx`; ligação em `Dashboard.tsx` e `AppSidebar.tsx`.
