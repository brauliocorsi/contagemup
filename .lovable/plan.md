# Bloqueio de picking para stock fora de localizações de stock

Objetivo: no scanner (módulo Picking), impedir que se faça picking de um produto cujo stock disponível esteja **exclusivamente** em localizações que não são de stock (cais de descarga, zonas livres/conferência, quarentena, viaturas).

## Regras acordadas

- Se 100% do stock do produto estiver em localizações não-stock: **bloquear sempre** (sem confirmação, sem exceção para admin).
- Se existir pelo menos alguma unidade numa localização de stock normal: comportamento atual, sem aviso.
- Aplica-se a qualquer localização cujo tipo não seja `stock` (cais de descarga/pré-saída, transporte, quarentena, zonas livres/staging), não só à "CAIS DESCARGA".

## Comportamento no scanner

1. Ao abrir/carregar uma lista de picking, o módulo calcula para cada linha onde está o stock do produto.
2. Linhas bloqueadas ficam marcadas visualmente: badge vermelho "Bloqueado — stock só em <localização>" e botões +/- desativados.
3. Ao ler o código de barras de um produto bloqueado: toast de erro claro, por exemplo
   "ARM182A: stock apenas em CAIS DESCARGA. Transfira para uma localização de stock antes de fazer picking." Não incrementa a quantidade.
4. Comandos de quantidade (CMD-QTY) e edição manual também são recusados para essas linhas.
5. Ao finalizar, as linhas bloqueadas são ignoradas (ficam a 0); se todas estiverem bloqueadas, o envio para o cais é recusado com mensagem explicativa.

## Detalhes técnicos

- Novo hook `src/hooks/usePickingStockLocations.tsx` (ou função em `src/lib/scanner/`): recebe a lista de `product_id` das linhas e devolve, por produto, as localizações com `quantity > 0` a partir de `counts`, cruzadas com `warehouse_locations.location_type` (comparação de código insensível a maiúsculas/acentos, como já se faz no TransferModule).
- Produto é considerado bloqueado quando tem stock > 0 mas nenhuma localização com `location_type = 'stock'` (localizações sem correspondência em `warehouse_locations` são tratadas como stock, para não bloquear indevidamente).
- Alterações em `src/components/scanner/PickingModule.tsx`:
  - guarda em `handleScan`, `setPicked`/`bump` e no handler de quantidade;
  - estado visual por linha em `renderLine`;
  - filtro das linhas bloqueadas em `finalize`.
- Sem alterações de base de dados nem às RPCs (`stage_picking_to_dock` mantém-se igual).
