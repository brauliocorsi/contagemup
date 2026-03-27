

# Correcção: Movimentos de stock apenas para sets completos

## Problema

As funções `incrementCountAtLocation` e `decrementCountAtLocation` em `useCounting.tsx` (linhas 820-960) estão a:
1. Inserir registos em `stock_movements` por cada ajuste individual de coli
2. Fazer update manual do `current_stock` com +1/-1

Isto é **incorrecto** porque o stock de um produto multi-coli só deve mudar quando **todos os colis** mudam por igual (set completo). O trigger `sync_product_stock` já calcula o stock correcto (mínimo entre todos os colis), mas o código está a sobrepor esse cálculo.

As funções `incrementCount` e `decrementCount` (linhas 213-311) já estão correctas — apenas registam count_logs e deixam o trigger recalcular.

## Plano

### 1. Corrigir `incrementCountAtLocation` (linhas 856-876)
- **Remover** o bloco que faz `products.update({ current_stock: ... })` 
- **Remover** o bloco que faz `stock_movements.insert(...)` com entrada
- Manter: update do `counts`, insert no `count_logs`, e `invalidateCounts()`
- O trigger `sync_product_stock` recalculará automaticamente o `current_stock` baseado no mínimo entre colis

### 2. Corrigir `decrementCountAtLocation` (linhas 923-957)
- **Remover** o bloco que faz `products.update({ current_stock: ... })`
- **Remover** o bloco que faz `stock_movements.insert(...)` com saída
- Manter os alertas de stock baixo, mas ler o stock **após o trigger** ter recalculado (aguardar brevemente e re-consultar)

### 3. Bump versão
- Actualizar `src/version.ts` para `v1.2.0`

## Ficheiros a modificar
- `src/hooks/useCounting.tsx` — remover inserções manuais de movimentos e updates de stock nas funções de localização específica
- `src/version.ts` — bump para v1.2.0

## Resultado
- Ajustes individuais de colis apenas alteram contagens e registam logs
- O stock (`current_stock`) é **sempre** calculado pelo trigger (mínimo entre colis)
- Movimentos em `stock_movements` são registados **apenas** pelas operações de entrada/saída manual (StockEntriesView/StockExitsView) que operam em sets completos
- Histórico de movimentos fica limpo e consistente

