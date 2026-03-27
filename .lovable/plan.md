

# Testar alteração de situação da venda #15815 no GestãoClick

## Objectivo
Testar se a API do GestãoClick permite alterar a `situacao` de uma venda via PUT, usando a venda **15815** como cobaia, mudando para **"Agendado Entrega"**.

## Plano

### 1. Actualizar a Edge Function `gestaoclick-update-supplier`
Adicionar uma nova action `update-sale-status` que:
- Busca a venda pelo número (GET `/api/vendas` com filtro)
- Faz PUT em `/api/vendas/{id}` com `{ situacao: "Agendado Entrega" }`
- Retorna o resultado para confirmar se a API aceitou ou ignorou o campo

### 2. Executar o teste
Invocar a função com a venda 15815 e verificar se o status foi realmente alterado no ERP.

### 3. Diagnóstico
Se o campo `situacao` for ignorado (como aconteceu com `fornecedor_id`), testar variações do nome do campo (`status`, `situacao_venda`, etc.).

## Ficheiros a editar
- `supabase/functions/gestaoclick-update-supplier/index.ts` — adicionar action `update-sale-status`

