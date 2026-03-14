

# Plano: Extrair Código Postal das Vendas (Debug + Fix)

## Problema
Os dados de vendas retornam todos com `cliente_cep: ""` e `cliente_endereco: ""`. O campo `enderecos` existe em cada venda mas o seu conteúdo nunca foi inspecionado nos logs. A morada com o código postal (ex: "Praça Francisco Sá Carneiro, 2 S 4620-695 - Lousada") está provavelmente dentro desse array `enderecos`.

## Plano (2 passos)

### Passo 1: Adicionar log do campo `enderecos` e fazer fetch individual de cliente

Na edge function `gestaoclick-vendas`, alterar o bloco de debug log (linhas 360-383) para incluir:
- `sample.enderecos` (o array completo, truncado a 3 entradas)
- Fazer um fetch individual ao endpoint `api/clientes/{cliente_id}` para o primeiro cliente, e logar a resposta completa

Isto permitir-nos-á ver exactamente onde está a morada e o código postal.

### Passo 2: Corrigir a extração baseada nos dados reais

Depois de ver a estrutura real nos logs:
- Atualizar `extractAddressEntries` para navegar correctamente na estrutura do `enderecos`
- Garantir que a regex `\d{4}-\d{3}` é aplicada ao texto correcto
- Remover o log de debug extra após confirmação

### Implementação imediata

Vou alterar o bloco de debug para logar `enderecos` e também buscar os dados do cliente individualmente via `api/clientes/{cliente_id}`, deployar a função e invocá-la para poder ver nos logs a estrutura real dos dados. Assim conseguimos extrair o código postal correctamente.

