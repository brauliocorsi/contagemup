# Refatoração das Entradas e Saídas de Stock

## O que se passou com o produto 2091621099205

- 13:40 — entrada de 2 unidades (motivo "Produção")
- 13:42 — saída de 2 unidades (motivo "Venda")

O stock ficou a 0 por causa da saída, não por perda de dados. A entrada foi gravada **sem localização e sem palete**, por isso o produto não aparece em nenhuma vista de armazém. O problema é geral: 2283 das 2939 linhas de contagem estão sem localização (1053 unidades "invisíveis").

## Objetivos

1. Nunca mais haver stock sem se saber onde está (sem bloquear o trabalho de quem regista).
2. Cada movimento passar a guardar a localização e a palete.
3. Poder anular uma entrada ou saída recente, revertendo o stock no sítio exato.
4. Entradas e saídas com o mesmo comportamento: carrinho, resumo e histórico.

## O que vai mudar

### 1. Avisos de localização em falta (não bloqueia)
- Na entrada, se um coli ficar sem localização/palete, aparece um aviso claro antes de confirmar e pede confirmação explícita.
- Novo painel "Stock sem localização" nas Entradas: lista os produtos/colis sem sítio definido e permite atribuir localização e palete diretamente, com correção em lote.

### 2. Rastreio de local e palete nos movimentos
- Cada movimento passa a registar a localização e a palete de origem (saída) ou destino (entrada), coli a coli.
- Histórico de entradas e saídas mostra "Coli 1: 2 un. @ B9/PLT057" em vez de apenas a quantidade total.

### 3. Anulação de movimentos
- Botão "Anular" nos movimentos recentes (entradas e saídas), disponível apenas para movimentos ainda não anulados.
- Anular uma entrada retira as unidades das localizações onde entraram; anular uma saída devolve-as às localizações de onde saíram.
- O movimento original mantém-se no histórico marcado como anulado, mais um movimento de reversão — nada é apagado.

### 4. Entradas e saídas consistentes
- Entrada mantém o carrinho já existente e ganha o mesmo resumo e histórico detalhado da saída.
- Saída passa a mostrar de que localização vai sair cada coli antes de confirmar.
- Ecrã único de histórico com filtros por produto, tipo, motivo, data e localização, com exportação.

## Detalhes técnicos

**Base de dados**
- Nova tabela `stock_movement_lines` (movimento, produto, coli, quantidade, localização, palete) com RLS e GRANTs.
- `stock_movements` ganha `reversed_at`, `reversed_by` e `reverses_movement_id`.
- `register_entry` e `commit_exit_cart` passam a gravar as linhas por coli.
- Nova RPC `reverse_stock_movement(p_movement_id)` — security definer, transacional, aplica as linhas ao contrário sobre `counts` e cria o movimento de reversão; rejeita movimentos já anulados.
- Nova RPC `assign_count_location(p_count_id, p_location, p_pallet)` para o painel de correção, com fusão automática se já existir linha no mesmo sítio.
- `stock_movements_unified` atualizada para expor os novos campos.

**Frontend**
- `StockEntriesView.tsx`: aviso de localização em falta na confirmação, histórico detalhado por coli, botão anular.
- `StockExitsView.tsx`: pré-visualização da origem por coli, histórico detalhado, botão anular.
- Novo `UnlocatedStockPanel.tsx` para corrigir stock sem localização.
- Novo `MovementHistoryView.tsx` partilhado por entradas e saídas.

**Sem alterações** à lógica de cálculo de stock (triggers `sync_product_stock`) nem às entradas por compra do Gestão Click.
