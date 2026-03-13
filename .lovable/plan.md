

## Diagnóstico de Performance

Os dados demoram porque:

1. **`gestaoclick-vendas`** faz 3 rondas sequenciais à API: (1) situações, (2) TODAS as páginas de vendas, (3) TODAS as páginas de produtos para resolver códigos. Se houver 50 páginas de vendas + 50 de produtos = ~100 chamadas HTTP sequenciais com delays de 200ms entre lotes.

2. **`gestaoclick-products`** faz o mesmo para produtos: todas as páginas em lotes de 5 com 200ms de delay.

3. **Sem cache** — cada vez que o utilizador clica "Sincronizar" ou "Carregar Vendas", tudo é buscado do zero.

4. **Chamadas sequenciais no frontend** — primeiro produtos ERP, depois vendas, nunca em paralelo.

## Solução Proposta

### 1. Cache local na base de dados (maior impacto)

Criar duas tabelas de cache:
- **`erp_products_cache`**: `code`, `name`, `erp_stock`, `grupo`, `fetched_at`
- **`erp_sales_cache`**: `product_code`, `venda_data` (jsonb), `fetched_at`

As edge functions guardam os resultados no cache. Chamadas subsequentes dentro de X minutos (ex: 15min) devolvem o cache em vez de chamar a API.

### 2. Aumentar paralelismo nas edge functions

- Subir `BATCH_SIZE` de 5 para 10 nas duas funções
- Reduzir delay entre lotes de 200ms para 50ms
- Na `gestaoclick-vendas`, buscar situações e primeira página de vendas em paralelo

### 3. Chamadas paralelas no frontend

No `useERPReconciliation`, lançar `fetchAndCompare` e `fetchSales` em paralelo (Promise.all) em vez de sequencialmente.

### 4. Pré-carregar vendas automaticamente

Quando o utilizador entra na Conciliação ERP, iniciar o fetch de vendas em background imediatamente, sem precisar clicar "Carregar".

---

### Alterações técnicas

**Nova migração SQL** — criar tabelas `erp_products_cache` e `erp_sales_cache`

**`supabase/functions/gestaoclick-products/index.ts`**:
- Verificar cache (`fetched_at` < 15min) antes de chamar API
- Guardar resultado no cache após fetch
- BATCH_SIZE: 5 → 10, delay: 200ms → 50ms

**`supabase/functions/gestaoclick-vendas/index.ts`**:
- Mesmo padrão de cache
- Paralelizar fetch de situações + primeira página de vendas
- BATCH_SIZE: 5 → 10, delay: 200ms → 50ms

**`src/hooks/useERPReconciliation.tsx`**:
- Aceitar parâmetro `skipCache` para forçar refresh
- Passar flag ao edge function

**`src/components/erp/ERPReconciliationView.tsx`**:
- Auto-carregar vendas no mount (`useEffect` com `fetchSales`)
- Lançar sync de produtos e vendas em paralelo
- Mostrar indicador "Cache: há X min" no UI

