# Teste sintético: previsto 600, declarado 600, envelope 200

Objetivo: provar, com dados falsos e sem tocar em stock, vendas ou registos reais, que a cadeia previsto -> declaração do entregador -> envelope -> conferência do financeiro deteta corretamente uma diferença de 400 EUR.

## Cenário

```text
Rota sintética (1 dia, 1 entregador falso)
  Nota A  previsto 600,00 EUR a cobrar na entrega
  Entrega confirmada
  Declarado pelo entregador:
      Numerário        200,00
      Multibanco       300,00
      Transferência    100,00
      total declarado  600,00
  Envelope entregue no fecho da rota: apenas 200,00 em numerário
  Financeiro conta o envelope: 200,00
Esperado: numerário bate (200 = 200); Multibanco 300 e Transferência 100
ficam por confirmar; enquanto não forem confirmados o valor em falta é 400,00.
```

A "diferença 400" é exatamente a soma das formas não-numerário ainda por confirmar. O teste tem de mostrar que o sistema a apresenta como pendente de conferência e não como dinheiro em falta do entregador.

## O que vai ser verificado

1. O previsto de 600 fica registado na nota e é o valor a cobrar da tentativa.
2. Depois de confirmada a entrega, a declaração 200+300+100 é aceite e soma 600, sem diferença face ao previsto.
3. Uma segunda submissão com a mesma chave de operação não duplica valores.
4. O fecho da rota com envelope de 200 é aceite e cria as conferências de Multibanco e Transferência.
5. A contagem do financeiro (200) fecha o numerário sem diferença.
6. Enquanto Multibanco e Transferência não forem confirmados, ficam 400 por conferir e a rota não pode ser dada como liquidada.
7. Depois de confirmadas as duas formas, a rota fecha sem diferenças.

## Como será executado (parte técnica)

- Tudo dentro de uma transação `BEGIN ... ROLLBACK`, com identificadores gerados na hora, prefixo `TESTE-SINT-`. Nada fica na base no fim.
- Sem chamadas à Gestão Click: a linha de previsto é inserida diretamente em `delivery_note_payables` com `classification = 'collect_on_delivery'`, a simular o resultado da importação. A importação real é testada à parte só em leitura.
- Sequência de chamadas: `attempt_amount_due` -> `declare_delivery_payments` (repetida com a mesma `op_key` para provar idempotência) -> `submit_route_accounting` -> `finance_count_envelope` -> `finance_confirm_method` (x2) -> `finance_resolve_closure`.
- Métodos usados: `numerario` (cobrar na entrega), `multibanco` e `transferencia` (exigem referência).
- Nenhum movimento de stock, nenhuma escrita no ERP, nenhum email ou mensagem.

## Entrega

Uma matriz com sete linhas: passo, valor esperado, valor observado e veredito (APROVADO / FALHOU / BLOQUEADO), mais o texto exato das mensagens que aparecem ao entregador e ao financeiro. Se algum passo falhar, indico a causa e proponho a correção num plano separado, sem a aplicar sem aprovação.
