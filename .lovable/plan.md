# Transferência: escolher e mover apenas um coli

## Problema

No módulo Transferência do scanner, ao ler o código de um produto o sistema escolhe automaticamente **um** registo de stock — o de maior quantidade — e adiciona 1 unidade (ou o passo definido). Não há forma de ver os vários colis daquele produto na origem, nem de escolher "quero mover só o coli 2, completo".

Só funciona escolher coli se o código lido já tiver o sufixo do coli (`CODIGO-C2`), o que não é óbvio e nem sempre existe etiqueta.

## O que vai mudar

1. **Seleção de coli ao ler o produto**
   - Se o produto tiver mais do que um registo de stock na origem (vários colis, ou o mesmo coli em locais diferentes quando não há origem definida), aparece um pequeno painel com a lista: `Coli N • local • X un.`
   - Toca-se no coli desejado e ele entra na lista de itens a transferir.
   - Se houver apenas um registo, comporta-se como hoje (entra direto, sem perguntar).
   - Ler `CODIGO-C2` continua a selecionar diretamente esse coli.

2. **Botão "Coli completo"**
   - Em cada item da lista de transferência, um botão que define a quantidade igual ao total disponível desse coli, para mover o coli inteiro numa ação.
   - Ao escolher um coli no painel de seleção, é possível adicionar direto como coli completo.

3. **Clareza visual**
   - Cada item da lista passa a mostrar o código do coli (ex.: `471723-C2`) além do número.

Nada muda na lógica de gravação: continua a usar a mesma operação de transferência já existente, com as quantidades indicadas.

## Detalhes técnicos

- `src/components/scanner/TransferModule.tsx`:
  - `addScan` deixa de assumir `rows[0]`; quando `rows.length > 1` guarda os candidatos em estado (`choices`) e mostra o painel de escolha; quando é 1, adiciona como hoje.
  - Novo helper `addRow(row, product, qty)` partilhado entre a seleção manual e o caminho automático.
  - Novo botão por item que faz `setQty(p.key, p.available)`.
  - Mostrar `colisCode(p.product_code, p.colis_number)` na linha do item.
- Sem alterações de base de dados nem ao RPC `transfer_stock_location`.
