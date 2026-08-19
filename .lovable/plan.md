# Scanner de Armazém (app móvel separada)

Nova área `/scanner`, com login existente, pensada para telemóvel: botões grandes, feedback sonoro/vibração e leitura de códigos pela câmara. Reutiliza o stock, paletes e localizações que já existem — nada do sistema atual é alterado, apenas acrescentado.

## Módulos

**1. Consulta de Produto**
- Lê o código do produto e mostra: nome, stock atual, colis, e uma lista de onde está (localização + palete + coli + quantidade).
- Botão "Reservado a clientes": consulta as vendas em aberto do GestãoClick (exclui conferido, confirmado, produto entregue, levantado e cancelada) e mostra quantas unidades estão reservadas e para que clientes.

**2. Transferência de Produtos**
- Lê o produto (ou coli específico), escolhe quantidade, depois lê/escolhe a localização de destino e o palete.
- Permite mover o produto completo ou apenas alguns colis — os restantes ficam onde estavam, como já acontece hoje.
- Lista de "scans" acumulados no ecrã antes de confirmar; confirmação move tudo de uma vez.

**3. Transferência de Palete Completo**
- Lê a etiqueta do palete e depois a localização de destino; todos os produtos/colis mantêm-se no palete e só muda a localização (mesma lógica do separador "Mover Paletes" já existente).

**4. Picking de Saída**
- Carrega uma lista de saída (ficheiro de picking, como já é feito nas Saídas) ou escolhe um carrinho pendente.
- Ecrã de conferência linha a linha: lê o produto, incrementa a quantidade conferida, mostra progresso e o que falta.
- Imprime etiquetas dos produtos da lista e, no fim, confirma e regista as saídas.

**5. Conferência de Entradas**
- Parte de uma compra do GestãoClick ou de uma entrada manual.
- Imprime etiquetas de todos os produtos da entrada (com código de barras).
- Conferência por leitura: lê cada produto/coli e confirma quantidades.
- Escolhe o fornecedor da entrada; ao finalizar, dá entrada no stock, guarda o fornecedor no movimento e atualiza o "último fornecedor" de cada produto.
- Produtos sem localização definida entram automaticamente na zona de conferência.

**6. Zona de Conferência no armazém**
- Nova localização base (ex.: `CONF`) criada na configuração do armazém. Tudo o que entra sem destino fica lá, e sai de lá pela Transferência.

## Códigos de barras e etiquetas

- Leitura: tenta primeiro o código do produto do sistema; se não existir, mostra um ecrã para associar o código lido a um produto (fica guardado para futuras leituras).
- Etiquetas geradas pelo sistema para produto/coli (`CÓDIGO-C1`) e paletes (`PAL-XXXX`).
- Impressão em dois formatos à escolha: folha A4 com grelha de etiquetas, ou etiqueta individual para impressora térmica (100x50 mm).

## Detalhes técnicos

- Rotas novas em `App.tsx`: `/scanner` com sub-separadores (consulta, transferência, palete, picking, entradas). Layout próprio mobile-first, sem a sidebar do desktop.
- Leitor de câmara com `@zxing/browser` (suporta EAN-13, Code128, QR), com entrada manual como alternativa.
- Base de dados (uma migração):
  - `products.barcode` (texto, único quando preenchido) e `products.last_supplier` / `last_supplier_id`.
  - `stock_movements.supplier_name` para registar o fornecedor da entrada.
  - `product_barcodes` para múltiplos códigos por produto (aliases lidos e associados).
  - RPC `transfer_stock_location(...)` transacional para mover colis entre localizações/paletes, criando linha de movimento de rastreio.
  - Registo da localização `CONF` em `warehouse_locations`.
- Reutiliza `useProducts`, `useWarehouseConfig`, `useProductSales`, `commit_exit_cart`, `register_entry` e o parser de picking existente — sem alterar o comportamento atual dessas peças.
- Etiquetas em PDF via `jspdf` (já usado no projeto) + `jsbarcode` para gerar o código de barras.

## Ordem de entrega

1. Migração + rota `/scanner` + componente de leitura e consulta de produto.
2. Transferência de produtos/colis e de paletes completos.
3. Etiquetas (A4 + térmica).
4. Picking de saída.
5. Conferência de entradas com fornecedor.
