# Picking no scanner (gestão ADM) + Contagem por localização no scanner

## 1. Gestão de pickings do scanner (área ADM)

Novo separador **Picking Scanner** no menu lateral (secção Stock), visível a todos mas com ações de remoção só para admin.

Lista de tarefas de picking com:
- Filtros por estado: pendentes, em curso, concluídas, canceladas (e "todas").
- Colunas: nome, referência, origem, criado por (nome do utilizador), data de criação, início, conclusão, progresso (itens conferidos / total, unidades pedidas vs conferidas).
- Detalhe expandível com as linhas da tarefa (produto, quantidade pedida, quantidade conferida, quem conferiu e quando).
- Ações: **Cancelar** tarefa, **Reabrir** (voltar a pendente) e **Eliminar** (apaga tarefa e linhas) — eliminar/cancelar reservado a admin, com confirmação.

No scanner (módulo Picking):
- Na lista de tarefas abertas, botão para **eliminar/cancelar a tarefa selecionada** caso tenha sido enviada por engano (com confirmação).
- Registo de quem conferiu cada linha ao gravar progresso.

## 2. Contagem por localização no scanner

Reaproveita a estrutura de auditorias de localização já existente (Armazém > Auditoria).

Lado ADM:
- No ecrã de auditoria de localizações, ao criar a contagem passa a poder-se **atribuir a um utilizador** (lista de perfis).
- Lista de contagens mostra o responsável, estado e progresso.

Lado scanner:
- Novo ícone **Contagem** no ecrã inicial e na barra inferior.
- Mostra as contagens atribuídas ao utilizador autenticado (e as não atribuídas), com as localidades a confirmar.
- Fluxo: escolher localidade → ler produtos/colis um a um (mesmo comportamento de leitura contínua já usado nos outros módulos) ou introduzir quantidade manualmente.
- Ao gravar, compara com o stock esperado da localidade e mostra imediatamente a divergência (esperado vs contado, diferença).
- Ao concluir a localidade/contagem, o registo fica fechado e as divergências ficam disponíveis no relatório de auditoria já existente (sem alterar stock automaticamente).

## Notas técnicas

- Migração:
  - `scanner_picking_tasks`: manter `created_by`; adicionar `cancelled_at`; políticas de DELETE restritas a admin (`has_role(auth.uid(),'admin')`) em `scanner_picking_tasks` e `scanner_picking_task_items` (cascade nas linhas).
  - `scanner_picking_task_items`: adicionar `picked_by uuid`, `picked_at timestamptz`.
  - `location_audits`: adicionar `assigned_to uuid` (referência a `auth.users`), com índice.
- Hooks: estender `useScannerPickingTasks` (listar todas com filtros, cancelar, reabrir, eliminar, gravar `picked_by`); estender `useLocationAudits` (atribuição e consulta por utilizador).
- Novos componentes: `src/components/stock/ScannerPickingAdminView.tsx` e `src/components/scanner/CountingModule.tsx`; registo da nova vista em `Dashboard.tsx` e `AppSidebar.tsx`, e do novo módulo em `ScannerApp.tsx`.
- Nomes de utilizadores obtidos via `profiles` (join por `user_id`).
