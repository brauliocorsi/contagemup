
# Plano: Corrigir Remoção de Stock Genérico

## Problemas Identificados

### Problema 1: Múltiplos registos por colis na tabela `counts`
A tabela `counts` tem **múltiplos registos** para o mesmo produto/colis:
```text
Cama Alice 190x140cm - Célia 2:
  colis_number=1: 5 registos (quantidade total = 4)
  colis_number=2: 1 registo  (quantidade total = 0)
```

A função `removeGenericStock` usa `maybeSingle()` que só encontra **um registo** - pode encontrar um com `quantity=0` e não fazer nada!

### Problema 2: Trigger não considera colis da categoria
O trigger `sync_product_stock` calcula o stock usando `product.total_colis` (que é **1** para este produto), mas a **categoria define 2 colis**. Resultado: stock mostra **4** quando deveria mostrar **0** (MIN entre coli 1 e coli 2).

### Problema 3: Sessão de remoção
Conforme o replay, o utilizador removeu uma **encomenda rastreada** (confirmou "Remover encomenda?"), não stock genérico. A remoção de encomendas decrementa os counts - mas como o trigger usa `total_colis=1`, só recalcula com base no coli 1.

## Solução

### Parte 1: Corrigir `removeGenericStock` em `useOrderNumbers.tsx`

**De:**
```typescript
const { data: existingCount } = await supabase
  .from('counts')
  .select('id, quantity')
  .eq('product_id', productId)
  .eq('colis_number', i)
  .maybeSingle(); // PROBLEMA: só devolve 1 registo!
```

**Para:**
```typescript
// Buscar TODOS os registos para este coli e decrementar do primeiro com quantidade > 0
const { data: existingCounts } = await supabase
  .from('counts')
  .select('id, quantity')
  .eq('product_id', productId)
  .eq('colis_number', i)
  .order('quantity', { ascending: false }); // Maiores quantidades primeiro

if (existingCounts && existingCounts.length > 0) {
  // Encontrar primeiro registo com quantidade suficiente
  const countToUpdate = existingCounts.find(c => c.quantity > 0);
  if (countToUpdate) {
    const newQty = Math.max(0, countToUpdate.quantity - quantity);
    await supabase
      .from('counts')
      .update({ quantity: newQty, updated_at: new Date().toISOString() })
      .eq('id', countToUpdate.id);
  }
}
```

### Parte 2: Actualizar trigger para considerar categoria

O trigger `sync_product_stock` precisa consultar a categoria do produto para determinar o número real de colis:

```sql
-- Dentro do trigger sync_product_stock
-- Buscar total_colis efectivo considerando a categoria
SELECT 
  p.total_colis,
  COALESCE(jsonb_array_length(c.colis_names::jsonb), 0) as category_colis_count
INTO product_total_colis, category_colis_count
FROM products p
LEFT JOIN categories c ON p.category = c.name
WHERE p.id = affected_product_id;

-- Usar o MAIOR valor
effective_total_colis := GREATEST(product_total_colis, category_colis_count);
```

**Nota**: A coluna `colis_names` é JSONB com estrutura `{"1": "Cabeceira", "2": "Ilhargueiro"}`, então precisamos contar as chaves do objecto.

### Parte 3: Corrigir sincronização em todas as funções

As seguintes funções também usam `maybeSingle()` e precisam da mesma correcção:
- `addOrderNumber` (linha ~98-110)
- `updateColisStatus` (linha ~185-205)
- `deleteOrderNumber` (linha ~330-355)

## Ficheiros a Modificar

| Ficheiro | Alteração |
|----------|-----------|
| `src/hooks/useOrderNumbers.tsx` | Substituir `maybeSingle()` por query que busca todos os registos e decrementa do correcto |
| Migração SQL | Actualizar trigger `sync_product_stock` para usar `GREATEST(product.total_colis, category.colis_count)` |

## Lógica Corrigida

```text
removeGenericStock(1):
  Para cada coli (1 a totalColis):
    1. Buscar TODOS os registos de counts para este coli
    2. Ordenar por quantidade descendente
    3. Encontrar primeiro registo com quantity > 0
    4. Decrementar esse registo
    
  → Trigger dispara automaticamente
  → Recalcula current_stock = MIN(soma_coli_1, soma_coli_2, ...)
```

## Secção Técnica

### Query corrigida para counts

```typescript
// Antes (ERRADO - só devolve 1 registo aleatório)
.eq('colis_number', i).maybeSingle()

// Depois (CORRECTO - busca todos e escolhe o certo)
.eq('colis_number', i).order('quantity', { ascending: false })
```

### Trigger SQL actualizado

```sql
CREATE OR REPLACE FUNCTION public.sync_product_stock()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  affected_product_id uuid;
  product_total_colis integer;
  category_colis_count integer;
  effective_total_colis integer;
  -- ... resto das variáveis
BEGIN
  -- Buscar total_colis do produto E da categoria
  SELECT 
    p.total_colis,
    COALESCE(
      (SELECT count(*) FROM jsonb_object_keys(c.colis_names) as k), 
      0
    )::integer
  INTO product_total_colis, category_colis_count
  FROM products p
  LEFT JOIN categories c ON p.category = c.name
  WHERE p.id = affected_product_id;
  
  -- Usar o MAIOR valor
  effective_total_colis := GREATEST(
    COALESCE(product_total_colis, 1), 
    COALESCE(category_colis_count, 0)
  );
  
  -- Calcular MIN entre todos os colis
  IF effective_total_colis <= 1 THEN
    SELECT COALESCE(SUM(quantity), 0) INTO base_stock
    FROM counts WHERE product_id = affected_product_id;
  ELSE
    min_qty := NULL;
    FOR i IN 1..effective_total_colis LOOP
      SELECT COALESCE(SUM(quantity), 0) INTO coli_qty
      FROM counts
      WHERE product_id = affected_product_id AND colis_number = i;
      
      IF min_qty IS NULL OR coli_qty < min_qty THEN
        min_qty := coli_qty;
      END IF;
    END LOOP;
    base_stock := COALESCE(min_qty, 0);
  END IF;
  
  -- ... resto da lógica
END;
$function$;
```
