

# Plano: Sincronizar Counts com Entradas Administrativas

## Problema Identificado

Existe uma discrepância entre os "Sets Completos" mostrados em duas abas:

| Aba | Fonte de Dados | Exemplo (Sistema Elevatório) |
|-----|----------------|------------------------------|
| Gestão de Produtos | `products.current_stock` | 104 sets |
| Contagem | `counts.quantity` (sessão atual) | 7 sets |

### Causa Raiz

O campo `current_stock` é calculado pelo trigger da base de dados usando a fórmula:
```
current_stock = SUM(counts) + SUM(stock_movements.entrada) - SUM(picking_items)
```

Mas a interface de **Contagem** calcula `completeSets` diretamente da tabela `counts`, ignorando:
- Entradas administrativas (`stock_movements`)
- Saídas de picking (`picking_items`)

### Dados Concretos do Problema

Para o produto "Sistema Elevatório 900N":
- `counts.quantity` = 7 (contagem física)
- `stock_movements` = 102 (entradas administrativas)  
- `picking_items` = 5 (saídas)
- `current_stock` = 104 (7 + 102 - 5) ✓

A contagem mostra apenas "7 sets" porque ignora as 102 entradas administrativas.

---

## Solução

A solução implementada anteriormente (atualizar `counts` ao registar entradas/saídas) afeta apenas movimentos **futuros**. Para corrigir os dados **históricos**, precisamos de uma migração de sincronização.

### Opção A: Migração de Dados (Recomendada)

Criar um script que sincronize os `counts` existentes para refletir o `current_stock` actual:

```sql
-- Para cada produto, ajustar counts para refletir current_stock
-- Isto garante que a contagem visual corresponde ao stock real
```

**Lógica:**
1. Para cada produto com `current_stock > counts_total`:
   - Incrementar cada colis proporcionalmente
   - A diferença vem das entradas administrativas anteriores

2. Para cada produto com `current_stock < counts_total`:
   - Decrementar cada colis proporcionalmente
   - A diferença vem do picking anterior

### Opção B: Alterar Cálculo de completeSets (Alternativa)

Modificar `useCounting.tsx` para usar `current_stock` em vez de calcular a partir dos counts:

```typescript
// Em vez de:
const completeSets = Math.min(...quantities);

// Usar:
const completeSets = product.current_stock;
```

**Problema:** Isto desalinha a visualização por colis (ícones) do valor de sets completos.

---

## Plano de Implementação (Opção A)

### Passo 1: Criar Função de Sincronização

Criar uma função na base de dados que sincroniza os counts:

```sql
CREATE OR REPLACE FUNCTION sync_counts_with_stock()
RETURNS void AS $$
DECLARE
  product_row RECORD;
  diff integer;
  coli_increment integer;
BEGIN
  FOR product_row IN 
    SELECT p.id, p.total_colis, p.current_stock,
           COALESCE(SUM(c.quantity) / p.total_colis, 0) as avg_per_colis
    FROM products p
    LEFT JOIN counts c ON c.product_id = p.id
    GROUP BY p.id
  LOOP
    -- Calcular diferença
    diff := product_row.current_stock - product_row.avg_per_colis;
    
    IF diff != 0 THEN
      -- Atualizar cada colis
      FOR i IN 1..product_row.total_colis LOOP
        UPDATE counts 
        SET quantity = GREATEST(0, quantity + diff)
        WHERE product_id = product_row.id 
        AND colis_number = i;
      END LOOP;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;
```

### Passo 2: Interface de Sincronização

Adicionar botão "Sincronizar Contagem" na interface que:
1. Mostra preview das alterações
2. Permite confirmar antes de aplicar
3. Atualiza os counts para corresponder ao `current_stock`

### Passo 3: Atualizar Trigger (Opcional)

Simplificar o trigger `sync_product_stock` para calcular `current_stock` apenas dos `counts`, já que as entradas/saídas agora atualizam diretamente os counts.

---

## Ficheiros a Modificar

1. **Migração SQL** - Criar função de sincronização e executar uma vez
2. **`src/components/stock/StockEntriesView.tsx`** - Verificar que a nova lógica está correcta
3. **`src/components/reports/StockIntegrityReport.tsx`** - Adicionar botão de sincronização
4. **`src/hooks/useCounting.tsx`** - (Opcional) Incluir counts de sessões anteriores

---

## Impacto Esperado

Após sincronização:
- Gestão de Produtos: 104 sets ✓
- Contagem: 104 sets ✓ (era 7)

A visualização por colis irá mostrar uniformemente o stock real, permitindo identificar pendências reais vs diferenças históricas.

