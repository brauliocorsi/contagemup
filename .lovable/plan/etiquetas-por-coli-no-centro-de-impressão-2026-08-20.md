# Etiquetas por coli no Centro de Impressão

Hoje o separador "Produtos" do Centro de Impressão gera uma etiqueta por produto. Passa a gerar uma etiqueta por coli, para permitir controlo individual de cada volume.

## O que muda

- Cada produto passa a produzir tantas etiquetas quantos os colis que tem (ex.: produto com 2 colis → 2 etiquetas).
- O código de barras de cada etiqueta passa a ser `CODIGOPRODUTO-C1`, `CODIGOPRODUTO-C2`, etc. (formato já reconhecido pelo scanner).
- A etiqueta mostra o nome do produto, o código base, o nome do coli quando a categoria o define (ex.: "Tampo", "Pés") e a indicação "Coli 1 de 2".
- Produtos com apenas 1 coli continuam a ter uma única etiqueta, mas identificada como `CODIGO-C1`.
- Um interruptor "Etiqueta por coli" (ligado por omissão) permite voltar a imprimir uma única etiqueta por produto com o código simples, para quem só quer a etiqueta geral.
- A seleção de itens passa a ser por coli, por isso é possível imprimir só o coli 2 de um produto, por exemplo.

## Detalhes técnicos

- `src/components/scanner/PrintCenterModule.tsx`
  - A query de produtos passa a trazer também `total_colis` e `category`, e a carregar `categories(name, colis_names)` para obter os nomes dos colis.
  - Número de colis efetivo = `GREATEST(products.total_colis, nº de chaves em categories.colis_names)`, seguindo a regra já usada no resto do sistema.
  - Cada produto é expandido em N linhas: `id: prod-<id>-c<n>`, `code: colisCode(product.code, n)`, `title: nome do produto`, `subtitle: <código> • <nome do coli> • Coli n/N` (mantendo localização/palete quando existem).
  - Novo estado `perColi` (default `true`) que controla a expansão; quando desligado mantém-se o comportamento atual (código de barras do produto ou barcode registado).
- `src/lib/scanner/commands.ts` — sem alterações; `colisCode()` e `parseScan()` já suportam o sufixo `-C<n>`.
- `src/lib/scanner/labels.ts` — sem alterações na geração do PDF.

Nada nos módulos de entradas, saídas, picking ou transferências é alterado.
