

# Atualizar fornecedor "UP Fábrica" nos produtos "Cam Estofada" no GestãoClick

## Situação actual

- Existem **~80+ produtos** no ERP com "Cam Estofada" no nome
- A API do GestãoClick **não documenta publicamente** os endpoints de edição de produtos nem o campo de fornecedor
- Os dados de produto retornados pela API não incluem campo `fornecedor_id` — o que significa que precisamos investigar a estrutura do PUT

## Plano

### 1. Criar Edge Function `gestaoclick-update-product`
Nova função que:
- Aceita uma lista de product IDs e o fornecedor_id a associar
- Faz PUT/PATCH para `https://api.gestaoclick.com/api/produtos/{id}` com o campo `fornecedor_id`
- Processa em lote com retry

### 2. Criar Edge Function `gestaoclick-fornecedores`
Nova função para:
- Listar fornecedores via `GET https://api.gestaoclick.com/api/fornecedores`
- Pesquisar pelo nome "UP Fábrica" para obter o ID interno

### 3. Criar Edge Function `gestaoclick-bulk-update-supplier`
Função orquestradora que:
- Busca todos os produtos com "Cam Estofada" no nome (via cache ou API)
- Busca o ID do fornecedor "UP Fábrica"
- Faz PUT em cada produto com o `fornecedor_id` correcto
- Retorna relatório de sucesso/falha

### 4. Adicionar botão temporário na UI (ou executar via curl)
Opção de executar a operação directamente via `curl_edge_functions` para testar primeiro

## Risco principal
A API do GestãoClick pode **não suportar** PUT com `fornecedor_id` no endpoint de produtos, ou o campo pode ter outro nome. O plano inclui um passo de teste antes de executar em massa.

## Abordagem segura
1. Primeiro: buscar fornecedores para encontrar o ID de "UP Fábrica"
2. Segundo: testar PUT num único produto para validar que funciona
3. Terceiro: aplicar em massa nos ~80 produtos

## Ficheiros a criar
- `supabase/functions/gestaoclick-update-supplier/index.ts` — função que busca fornecedor, filtra produtos e aplica update em lote

