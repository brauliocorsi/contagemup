# Integração UP Agenda → Contagem (separação e cancelamento)

Sim, é possível. O UP Agenda passa a chamar uma API do Contagem: ao confirmar o agendamento e clicar em "Separar", o Contagem faz as saídas de stock; se depois houver cancelamento, o Contagem devolve as unidades exatamente às localizações/paletes de onde saíram.

## Como vai funcionar

```text
UP Agenda                         Contagem (este projeto)
---------                         -----------------------
Confirmar + "Separar"  --POST-->  /agenda-picking  (separar)
                                    - procura produtos pelo código GestãoClick
                                    - debita counts (prioridade chão -> altura)
                                    - grava origem exata de cada unidade
                       <--------  resultado: separado / parcial + faltas

Cancelar agendamento   --POST-->  /agenda-picking  (cancelar)
                                    - devolve cada unidade à origem exata
                       <--------  confirmação
```

## Regras acordadas

- **Identificação de produtos**: pelo código GestãoClick. Código desconhecido no Contagem entra como "em falta" no aviso, sem bloquear o resto.
- **Stock insuficiente**: saída parcial. A resposta indica, por produto, pedido vs. separado e o que ficou em falta.
- **Cancelamento**: devolução à origem exata (mesma localização, palete e coli de onde saiu).
- **Idempotência**: cada agendamento tem um identificador único. Chamar "separar" duas vezes para o mesmo agendamento não duplica saídas; cancelar duas vezes não duplica devoluções.
- **Cancelamento parcial**: suportado por linha (produto), caso o UP Agenda envie apenas parte dos itens.

## O que se vê no Contagem

- Cada separação vinda da agenda aparece no histórico de saídas com referência do tipo `Agenda #<nº>` e o nome do cliente.
- Novo separador em Movimentos/Relatórios: **Agendamentos**, com lista de agendamentos separados, estado (separado / parcial / cancelado), itens e faltas, e botão manual de "Devolver ao stock" para casos excecionais.

## Detalhes técnicos

**Base de dados (migração)**
- `agenda_pickings`: `external_id` (único, id do agendamento no UP Agenda), `client_name`, `scheduled_date`, `status` (`separado` | `parcial` | `cancelado`), `notes`, timestamps.
- `agenda_picking_lines`: ligação ao picking, `product_code`, `product_id`, `requested_qty`, `fulfilled_qty`, `status`.
- `agenda_picking_allocations`: origem exata de cada débito — `line_id`, `count_id`, `colis_number`, `location`, `pallet_number`, `quantity`, `reverted_at`. É esta tabela que permite a devolução à origem.
- RLS: leitura para utilizadores autenticados; escrita apenas via `service_role` (edge function). GRANTs explícitos.

**RPCs transacionais (SECURITY DEFINER)**
- `agenda_commit_picking(p_external_id, p_client_name, p_scheduled_date, p_items jsonb)` — reutiliza a mesma lógica de prioridade de localização já usada nas saídas (nível chão primeiro), debita `counts`, grava alocações, cria `stock_movements` de saída com referência `Agenda #<id>`, devolve resumo por item.
- `agenda_revert_picking(p_external_id, p_items jsonb default null)` — percorre alocações não revertidas, repõe em `counts` (mesma linha se existir, senão recria com a mesma localização/palete/coli), marca `reverted_at`, cria `stock_movements` de entrada com motivo `agenda_cancelada`.

**Edge function `agenda-picking`**
- `POST /agenda-picking` com `{ action: "separar" | "cancelar", agendamento: {...}, itens: [{ codigo, quantidade }] }`.
- Autenticação por chave partilhada em header (`x-api-key`), guardada como secret no Contagem e configurada no UP Agenda. Sem chave válida → 401.
- Validação de payload com Zod, CORS ativo, resposta com estado por item e lista de faltas.

**Do lado do UP Agenda** (projeto separado, alterações a fazer lá): chamar este endpoint no botão "Separar" e no cancelamento, guardar o resultado/faltas e mostrar o aviso ao utilizador. Neste projeto só posso preparar o lado Contagem e entregar-te o contrato da API e a chave.

## Fora do âmbito

- Não altera os fluxos atuais de entradas, saídas manuais, picking ou ERP.
- Não sincroniza vendas com o GestãoClick — isso continua como está.
