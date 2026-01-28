
# Plano: Sistema de Rastreamento de Avarias

## Resumo
Implementar funcionalidade para marcar produtos com avarias, registar quantidades danificadas, separar do stock normal e gerar relatórios de produtos avariados.

## Arquitetura da Solução

### 1. Alterações na Base de Dados

#### Nova Tabela: `product_damages`
Tabela dedicada para registar cada ocorrência de avaria:

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid | Identificador único |
| product_id | uuid | Referência ao produto |
| quantity | integer | Quantidade de unidades avariadas |
| colis_number | integer | Número do coli afetado (para produtos multi-colis) |
| damage_type | text | Tipo de dano (Quebra, Amassado, Risco, Molhado, etc.) |
| description | text | Descrição detalhada do dano |
| location | text | Localização onde foi encontrado |
| pallet_number | text | Palete onde estava |
| reported_by | uuid | Utilizador que reportou |
| resolved_at | timestamp | Data de resolução (se aplicável) |
| resolution_notes | text | Como foi resolvido |
| created_at | timestamp | Data do registo |

#### Novo Campo na Tabela `products`
- `damaged_stock` (integer, default 0): Quantidade total de unidades em avaria

### 2. Interface do Utilizador

#### A. Botão de Reportar Avaria no ProductCard
- Adicionar ícone de "avaria" (AlertOctagon) no card de produto
- Abre dialog para registar nova avaria
- Campos: Quantidade, Coli afetado, Tipo de dano, Descrição, Localização

#### B. Nova Vista: "Avarias" (DamagesView)
Nova aba na navegação entre "Alertas" e "Separação":
- **Resumo**: Total de produtos com avaria, total de unidades danificadas
- **Lista de Avarias Ativas**: Tabela com filtros por tipo, produto, data
- **Ações**: Marcar como resolvida, exportar relatório

#### C. Badge de Avaria no ProductCard
- Quando produto tem `damaged_stock > 0`, mostrar badge vermelho
- Tooltip mostrando quantidade e tipo(s) de dano

### 3. Fluxo de Operação

```text
1. Operador encontra produto danificado
                ↓
2. Clica no ícone de avaria no ProductCard
                ↓
3. Preenche formulário:
   - Quantidade de unidades
   - Qual coli (se multi-colis)
   - Tipo de dano
   - Descrição
                ↓
4. Sistema:
   - Cria registo em product_damages
   - Incrementa damaged_stock do produto
   - Decrementa current_stock (opcional - configurável)
                ↓
5. Produto aparece na lista de Avarias
                ↓
6. Quando resolvido:
   - Marca como resolvido
   - Especifica resolução (reparado/descartado/devolvido)
   - Atualiza stocks conforme resolução
```

### 4. Componentes a Criar

#### Novos Ficheiros:
- `src/components/damages/DamagesView.tsx` - Vista principal de avarias
- `src/components/damages/DamageReportDialog.tsx` - Dialog para reportar avaria
- `src/components/damages/DamageResolutionDialog.tsx` - Dialog para resolver avaria
- `src/components/damages/DamagesTable.tsx` - Tabela de avarias
- `src/hooks/useDamages.tsx` - Hook para gestão de avarias

#### Ficheiros a Modificar:
- `src/components/counting/ProductCard.tsx` - Adicionar botão e badge de avaria
- `src/components/layout/Navigation.tsx` - Adicionar aba "Avarias"
- `src/pages/Dashboard.tsx` - Renderizar DamagesView
- `src/types/stock.ts` - Adicionar tipos de avaria

### 5. Tipos de Dano Predefinidos
- Quebra
- Amassado
- Risco/Arranhão
- Molhado/Humidade
- Peça em falta
- Embalagem danificada
- Defeito de fábrica
- Outro

### 6. Funcionalidades de Relatório
- Exportar CSV/Excel com todas as avarias
- Filtrar por período, tipo, produto, estado
- Estatísticas: mais danificados, tipos mais comuns

---

## Detalhes Técnicos

### Migração SQL

```sql
-- Adicionar campo damaged_stock à tabela products
ALTER TABLE products 
ADD COLUMN damaged_stock integer NOT NULL DEFAULT 0;

-- Criar tabela product_damages
CREATE TABLE product_damages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1,
  colis_number integer,
  damage_type text NOT NULL,
  description text,
  location text,
  pallet_number text,
  reported_by uuid,
  status text NOT NULL DEFAULT 'active',
  resolved_at timestamp with time zone,
  resolution_type text,
  resolution_notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- RLS Policies
ALTER TABLE product_damages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view damages" 
  ON product_damages FOR SELECT 
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create damages" 
  ON product_damages FOR INSERT 
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update damages" 
  ON product_damages FOR UPDATE 
  USING (auth.uid() IS NOT NULL);

-- Trigger para updated_at
CREATE TRIGGER update_product_damages_updated_at
  BEFORE UPDATE ON product_damages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### Hook useDamages
```typescript
// Funções principais:
- fetchDamages() - Listar avarias com filtros
- reportDamage() - Criar nova avaria
- resolveDamage() - Marcar como resolvida
- getDamageStats() - Estatísticas de avarias
```

### Integração com Stock
Opção configurável:
- **Modo A**: Avaria separa do stock (current_stock - damaged_stock = disponível)
- **Modo B**: Avaria subtrai do stock imediatamente

---

## Ordem de Implementação

1. **Migração DB** - Criar tabela e campo
2. **Hook useDamages** - Lógica de dados
3. **DamageReportDialog** - Formulário de reportar
4. **ProductCard** - Botão e badge de avaria
5. **DamagesView** - Vista principal
6. **Navigation** - Adicionar aba
7. **Dashboard** - Renderizar vista
8. **Exportação** - CSV/Excel de avarias

## Resultado Final
- Operadores podem reportar avarias diretamente no card do produto
- Vista dedicada para gestão de todas as avarias
- Separação clara entre stock disponível e stock danificado
- Relatórios exportáveis para análise
- Histórico completo de cada avaria
