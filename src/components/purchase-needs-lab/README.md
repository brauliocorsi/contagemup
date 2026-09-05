# Necessidades de Compra — Testes (módulo experimental removível)

Ambiente de **simulação**, só de leitura. Nunca cria nem altera vendas, compras, produtos, stock,
reservas ou movimentos. Não contacta fornecedores. Não publica nada.

## O que faz
- Lê as **situações reais** de vendas e compras do GestãoClick (nada é adivinhado) e deixa escolher
  quais entram como procura e quais contam como compras por receber.
- Lê vendas e compras com paginação completa (`proxima_pagina` / `total_paginas`), no máximo
  3 pedidos por segundo, com espera em 429/503. Leitura truncada ou com erros é **assinalada** e o
  resultado nunca é apresentado como completo.
- Lê o físico do Contagem (`products` + `counts` + `warehouse_locations`). Cobertura livre =
  conjuntos completos (mínimo entre colis) em localizações de tipo `stock` que não sejam zona livre.
  Quarentena, cais, viatura, conferência, zonas livres e localizações desconhecidas **nunca** contam
  como livres — aparecem como "a rever".
- Calcula por produto/variação/configuração: pendente de entregar, cobertura física, compras por
  receber e `falta comprar = max(0, pendente - coberturas)`, com atribuição **FIFO cronológica**.
  Cada unidade física ou de compra cobre no máximo uma venda.
- Compara com "o que eu compraria manualmente", mostra a diferença, aceita notas locais, filtra por
  fornecedor/produto/faltas e exporta CSV.
- Guarda uma **referência** (snapshot) para ver só o que mudou; o cálculo é determinístico e
  reexecutável — repetir não acumula quantidades nem duplica propostas.

## Limitações honestas
- **`quantidade_saida` das compras tem semântica não confirmada.** Não é interpretada como recebido:
  o "por receber" fica desconhecido até ser indicado manualmente (marcado "manual de teste").
- **Não há ID estável de linha de produto** nas respostas do GestãoClick. A identidade usa
  `produto_id` + `variacao_id`; sem eles cai para código interno e, em último caso, nome/configuração
  com marca "a rever". Índice de array nunca é identidade sozinho.
- **Entregas parciais de vendas antigas não são dedutíveis.** Nas situações marcadas como "entregas
  parciais", o pendente é pedido linha a linha e o grupo fica "incompleto" até ser resolvido. Nunca
  é assumido zero.
- Stock negativo do GestãoClick não é usado como gatilho nem como físico.
- A ligação a fornecedores só é mostrada quando vem das compras lidas.

## Estado local
Guardado em `localStorage`, chave `needs-lab:v1:<user_id>`. Não é gravado na base de dados.
O botão **Limpar simulação** apaga apenas esta chave.

## Como remover o módulo (sem tocar em dados de negócio)
1. Apagar `src/components/purchase-needs-lab/`
2. Apagar `src/lib/purchase-needs-lab/`
3. Apagar `supabase/functions/needs-lab-gc/`
4. Em `src/components/layout/AppSidebar.tsx`: remover o item `needs-lab` e o ícone `FlaskConical`.
5. Em `src/pages/Dashboard.tsx`: remover o `lazy(...)` de `PurchaseNeedsLabView` e a linha
   `activeTab === 'needs-lab'`.

Não existem tabelas, colunas, políticas nem migrações associadas a este módulo.
