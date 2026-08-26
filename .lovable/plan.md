# Entradas sempre em conferência e fim da localização base do produto

O produto deixa de ter uma "localização base". A localização passa a existir apenas no stock real (por coli), criada pela entrada em conferência e alterada por transferência/arrumação no scanner.

## O que muda

1. **Cadastro/edição de produto**: desaparece o campo "Localização". Também sai da importação de produtos (coluna ignorada) e das fichas onde é mostrada.
2. **Entrada de stock**: a localização fica fixa na zona de conferência configurada (CONF). O operador já não pode escolher outra localidade na entrada — nem no scanner, nem nas entradas manuais, nem nas entradas por compra do ERP.
3. **Sair da conferência**: só por transferência/arrumação (módulo Arrumação ou Transferência no scanner, e o painel "Pendente de arrumação" no dashboard).
4. **Limpeza de dados**: as localizações base já gravadas nos produtos são apagadas (campo fica vazio). Não afeta o stock por localização, que vive nas contagens.

## Detalhes técnicos

Base de dados
- `UPDATE public.products SET location = NULL` (operação de dados, sem migração de schema). A coluna mantém-se para compatibilidade, mas deixa de ser escrita ou lida.

Frontend
- `ProductForm.tsx` / `ProductEditForm.tsx`: remover o input e o campo `location` do payload.
- `ImportProducts.tsx`: remover o mapeamento/preview da coluna de localização.
- Remover a apresentação da localização base em `VirtualizedProductRow.tsx`, `ProductColisDetailsDialog.tsx` (cabeçalho), `ProductDetailPopup.tsx`, `reports/ProductDetailsDialog.tsx`; em `reports/WarehouseMap.tsx` deixar de fazer fallback para `product.location` (fica "Sem localização"). As localizações por coli (contagens) mantêm-se em todo o lado.
- `EntryModule.tsx` (scanner): remover o `LocationSelect` e o tratamento de scan de localidade; usar sempre a zona de conferência (`useReceivingLocations`), mostrada apenas como informação bloqueada.
- `StockEntriesView.tsx`: fixar todas as linhas na zona de conferência, remover o seletor por coli e as sugestões por histórico/`selected.location`.
- `PurchaseEntryView.tsx`: mesma regra — localização fixa em conferência, sem seletor.
- Aviso claro nas entradas: "Entrada em conferência — arrumar depois no scanner".

Sem alterações às RPCs (`register_entry`, `transfer_stock_location`, `move_stock_qty`) nem ao bloqueio de picking em localidades de não-stock, que já existe.
