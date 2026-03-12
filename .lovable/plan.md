

## Problema Identificado

O problema esta na forma como o codigo do produto e extraido das vendas. Na Edge Function `gestaoclick-vendas`, os produtos dentro de cada venda sao mapeados usando `item.codigo || item.produto_codigo` (linha 144). Porem, na reconciliacao ERP, os produtos sao identificados pelo campo `codigo_interno` do GestãoClick. Se a API de vendas retorna o codigo do produto num campo diferente (ex: `codigo_interno`, `produto_codigo_interno`), os codigos nao batem e o mapa fica vazio para aquele produto.

## Plano

### 1. Adicionar logging de debug na Edge Function `gestaoclick-vendas`
- Logar a estrutura de um item de produto da primeira venda para identificar os campos disponíveis (ex: `codigo`, `codigo_interno`, `produto_codigo`, etc.)

### 2. Corrigir extração do código do produto
- Na linha 144 do `gestaoclick-vendas/index.ts`, expandir a extração para incluir `item.codigo_interno`:
```typescript
const productCode = String(item.codigo_interno || item.codigo || item.produto_codigo || '');
```

### 3. Redeploy da Edge Function
- Fazer deploy da função atualizada para aplicar a correção

### Impacto
- Apenas o ficheiro `supabase/functions/gestaoclick-vendas/index.ts` sera alterado
- A correcao garante que o codigo interno do produto (usado na reconciliacao) faz match com os codigos extraidos das vendas

