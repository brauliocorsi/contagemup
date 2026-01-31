

# Plano: Números de Encomenda por Unidade em Categorias Específicas

## Resumo da Funcionalidade

Permitir que certas categorias (ex: Camas) exijam um **número de encomenda** para cada unidade produzida. Isto significa:

1. Ao contar/adicionar stock de produtos dessas categorias, cada unidade precisa de um número de encomenda
2. Ao fazer saídas, seleccionar qual número de encomenda vai sair
3. Sistema verifica se a encomenda existe em stock antes de permitir a saída

## Fluxo Visual

```text
CONFIGURAÇÃO DA CATEGORIA:
┌─────────────────────────────────────────────────────────────────────────┐
│  Categoria: Camas                                                        │
│  ☑ Exigir número de encomenda por unidade                               │
│                                                                          │
│  Cada unidade de produtos nesta categoria precisará de um número        │
│  de encomenda associado (ex: ENC-2024-001, ENC-2024-002...)             │
└─────────────────────────────────────────────────────────────────────────┘

CONTAGEM/ENTRADA:
┌─────────────────────────────────────────────────────────────────────────┐
│  Produto: Cama Oslo Queen (4 colis)         Categoria: Camas 🔒         │
│                                                                          │
│  Adicionar unidade:                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │  Número de Encomenda: [_ENC-2024-001_________]                      ││
│  │  [Adicionar +1 unidade com esta encomenda]                          ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│  Unidades em stock (2):                                                  │
│  ┌──────────────────────────────────────────────────┐                    │
│  │  ENC-2024-001  │  Coli 1: ✓ │ Coli 2: ✓ │ ...   │                    │
│  │  ENC-2024-002  │  Coli 1: ✓ │ Coli 2: ⬜ │ ...   │ ← Incompleta      │
│  └──────────────────────────────────────────────────┘                    │
└─────────────────────────────────────────────────────────────────────────┘

SAÍDA DE STOCK:
┌─────────────────────────────────────────────────────────────────────────┐
│  Produto: Cama Oslo Queen          🔒 Requer nº encomenda               │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │  Número de Encomenda: [_ENC-2024-001_________] [Verificar]          ││
│  │                                                                      ││
│  │  ✓ Encontrado em stock!                                             ││
│  │    Localização: A-01-N1  |  Palete: PAL-001                         ││
│  │    Status: Todos os 4 colis presentes                               ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│  [Adicionar ao carrinho de saída]                                        │
└─────────────────────────────────────────────────────────────────────────┘
```

## Alterações no Banco de Dados

### 1. Adicionar campo à tabela `categories`

```sql
ALTER TABLE categories 
ADD COLUMN requires_order_number boolean NOT NULL DEFAULT false;
```

### 2. Criar tabela `stock_order_numbers`

```sql
CREATE TABLE stock_order_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  order_number text NOT NULL,
  -- Para rastrear quais colis desta encomenda estão em stock
  colis_status jsonb NOT NULL DEFAULT '{}', -- {"1": true, "2": true, "3": false, "4": true}
  location text,
  pallet_number text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  -- Garantir unicidade do número de encomenda por produto
  UNIQUE(product_id, order_number)
);

-- RLS policies
ALTER TABLE stock_order_numbers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view order numbers" ON stock_order_numbers
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert order numbers" ON stock_order_numbers
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update order numbers" ON stock_order_numbers
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete order numbers" ON stock_order_numbers
  FOR DELETE USING (auth.uid() IS NOT NULL);
```

## Alterações nos Ficheiros

### 1. Actualizar interface de Categorias

**Ficheiro**: `src/components/categories/CategoriesView.tsx`

- Adicionar checkbox "Exigir número de encomenda por unidade"
- Mostrar ícone/badge nas categorias que exigem número de encomenda
- Actualizar hook `useCategories` para incluir o novo campo

### 2. Actualizar hook de Categorias

**Ficheiro**: `src/hooks/useCategories.tsx`

```typescript
export interface Category {
  id: string;
  name: string;
  description: string | null;
  colis_names: Record<string, string> | null;
  requires_order_number: boolean; // NOVO
  created_at: string;
  updated_at: string;
}
```

### 3. Criar hook para Números de Encomenda

**Ficheiro**: `src/hooks/useOrderNumbers.tsx` (NOVO)

```typescript
interface OrderNumber {
  id: string;
  product_id: string;
  order_number: string;
  colis_status: Record<string, boolean>;
  location: string | null;
  pallet_number: string | null;
  created_at: string;
  updated_at: string;
}

export function useOrderNumbers() {
  // Funções para:
  // - Listar encomendas de um produto
  // - Adicionar nova encomenda (com todos os colis marcados)
  // - Actualizar status de coli específico
  // - Verificar se encomenda existe e está completa
  // - Marcar encomenda como saída
}
```

### 4. Actualizar ProductCard para Contagem

**Ficheiro**: `src/components/counting/ProductCard.tsx`

Para produtos de categorias com `requires_order_number`:
- Mostrar input para número de encomenda ao adicionar unidades
- Listar encomendas existentes com status de cada coli
- Permitir marcar/desmarcar colis por encomenda

### 5. Actualizar ManualStockSection para Entradas

**Ficheiro**: `src/components/stock/ManualStockSection.tsx`

- Detectar se categoria exige número de encomenda
- Mostrar input de número de encomenda em vez de quantidade simples
- Permitir adicionar múltiplas encomendas ao carrinho

### 6. Actualizar StockExitsView para Saídas

**Ficheiro**: `src/components/stock/StockExitsView.tsx`

Para produtos com `requires_order_number`:
- Input para pesquisar/introduzir número de encomenda
- Verificar se a encomenda existe e está completa
- Mostrar localização e palete da encomenda
- Bloquear saída se encomenda incompleta ou não encontrada

### 7. Criar componente de gestão de encomendas

**Ficheiro**: `src/components/stock/OrderNumberInput.tsx` (NOVO)

Componente reutilizável para:
- Input com autocomplete de números de encomenda
- Validação em tempo real
- Preview do status da encomenda

## Tipos a Adicionar

**Ficheiro**: `src/types/stock.ts`

```typescript
export interface OrderNumberEntry {
  id: string;
  product_id: string;
  order_number: string;
  colis_status: Record<string, boolean>; // {"1": true, "2": false, ...}
  is_complete: boolean; // Computed: todos os colis true
  location: string | null;
  pallet_number: string | null;
  created_at: string;
}
```

## Fluxo Detalhado

### Contagem/Entrada com Número de Encomenda

1. Operador selecciona produto de categoria com `requires_order_number = true`
2. Sistema mostra interface especial:
   - Lista de encomendas já em stock
   - Campo para adicionar nova encomenda
3. Ao adicionar nova encomenda:
   - Sistema cria registo em `stock_order_numbers`
   - Cria contagens em `counts` para cada coli (quantidade = 1)
4. Ao marcar coli específico de encomenda existente:
   - Actualiza `colis_status` na tabela `stock_order_numbers`
   - Actualiza contagem correspondente

### Saída com Número de Encomenda

1. Operador selecciona produto de categoria com `requires_order_number = true`
2. Sistema pede número de encomenda
3. Sistema verifica:
   - Se a encomenda existe
   - Se todos os colis estão presentes (completa)
4. Se válido:
   - Mostra localização e palete
   - Permite adicionar ao carrinho de saída
5. Ao confirmar saída:
   - Remove registo de `stock_order_numbers`
   - Decrementa contagens em `counts`

## Ficheiros a Criar

| Ficheiro | Descrição |
|----------|-----------|
| `src/hooks/useOrderNumbers.tsx` | Hook para gestão de números de encomenda |
| `src/components/stock/OrderNumberInput.tsx` | Input com autocomplete para encomendas |
| `src/components/counting/OrderNumberEntry.tsx` | Interface de entrada por encomenda no counting |

## Ficheiros a Modificar

| Ficheiro | Alteração |
|----------|-----------|
| `src/hooks/useCategories.tsx` | Adicionar campo `requires_order_number` |
| `src/components/categories/CategoriesView.tsx` | Checkbox para activar exigência |
| `src/components/counting/ProductCard.tsx` | Interface especial para produtos com encomenda |
| `src/components/stock/ManualStockSection.tsx` | Detectar e mostrar interface de encomenda |
| `src/components/stock/StockExitsView.tsx` | Pesquisa e validação por número de encomenda |
| `src/types/stock.ts` | Adicionar tipos para números de encomenda |

## Considerações Especiais

### Produtos com Múltiplos Colis
- Cada número de encomenda representa UM produto completo (todos os colis)
- O campo `colis_status` rastreia quais colis dessa encomenda estão presentes
- Uma encomenda só pode sair quando TODOS os colis estão completos

### Compatibilidade
- Categorias sem `requires_order_number` funcionam como antes
- Dados existentes não são afectados
- Migração gradual possível

### Validação
- Número de encomenda deve ser único por produto
- Formato livre (texto), sem validação de padrão
- Sugestão: prefixo + ano + número sequencial (ENC-2024-001)

