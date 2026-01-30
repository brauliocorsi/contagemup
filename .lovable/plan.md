
# Plano: Aplicar Regras de Stock nos Relatórios

## Objetivo
Atualizar todos os relatórios para incluir informações de **avarias (damaged_stock)** de forma consistente, garantindo que todos os componentes de relatório reflitam o estado real do inventário.

## Análise do Estado Atual

Os relatórios atualmente **não mostram informações de avarias**:
1. **StockIntegrityReport** - Verifica apenas `current_stock` vs cálculo de counts
2. **StockMovementsReport** - Mostra entradas/saídas, sem coluna de avarias
3. **CountingMovementsReport** - Mostra contagens, sem indicador de avarias
4. **ReportsView (Sessão Tab)** - Estatísticas não incluem avarias
5. **CountingSummary** - Não tem estatísticas de avarias
6. **DamagesView** - Já tem avarias (é o relatório dedicado)

## Alterações Planeadas

### 1. StockIntegrityReport.tsx
**Objetivo**: Incluir avarias na verificação de integridade

- Adicionar coluna `damaged_stock` na query de produtos
- Mostrar estatísticas de avarias no painel de saúde do sistema
- Adicionar indicador visual de produtos com avarias na lista de discrepâncias
- Nova card de resumo: "Produtos com Avarias"

### 2. StockMovementsReport.tsx  
**Objetivo**: Contextualizar movimentos com stock danificado

- Adicionar coluna "Avarias" na tabela de movimentos (mostrar badge se produto tem avarias ativas)
- No resumo estatístico, adicionar card "Produtos c/ Avarias"
- Exportar CSV com coluna de avarias

### 3. ReportsView.tsx (Aba Sessão)
**Objetivo**: Adicionar estatísticas de avarias ao relatório de sessão

- Adicionar card de "Unidades Avariadas" no resumo
- Adicionar coluna "Avarias" na tabela de produtos
- Incluir avarias no export CSV

### 4. CountingSummary.tsx
**Objetivo**: Mostrar totais de avarias no resumo de contagem

- Adicionar novo stat card "Avarias" com ícone AlertTriangle vermelho
- Mostrar total de produtos com avarias e unidades danificadas

### 5. CountingMovementsReport.tsx
**Objetivo**: Contextualizar contagens com informação de avarias

- No resumo estatístico, adicionar indicador de "Produtos c/ Avarias Ativas"

---

## Detalhes Técnicos

### Dados Necessários
Todos os componentes precisarão de acesso ao `damaged_stock` dos produtos:
```typescript
// Query existente expandida:
.select('id, code, name, total_colis, current_stock, damaged_stock')
```

### Padrão Visual Consistente
- **Badge de avaria**: `<Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">` com ícone AlertTriangle
- **Cor primária avarias**: `text-red-600` / `bg-red-50`
- **Card de estatística**: Ícone AlertTriangle + fundo vermelho claro

### Ficheiros a Modificar
1. `src/components/reports/StockIntegrityReport.tsx`
2. `src/components/reports/StockMovementsReport.tsx`
3. `src/components/reports/ReportsView.tsx`
4. `src/components/counting/CountingSummary.tsx`
5. `src/components/reports/CountingMovementsReport.tsx`

### Alterações de Query no StockIntegrityReport
```typescript
// Linha 53-55 - Adicionar damaged_stock
const { data: products, error: productsError } = await supabase
  .from('products')
  .select('id, code, name, total_colis, current_stock, damaged_stock')
  .order('name');
```

### Nova Interface IntegrityCheck
```typescript
interface IntegrityCheck {
  // ... campos existentes
  damagedStock: number; // Novo campo
}
```

### Nova Estatística Global (StockIntegrityReport)
```typescript
// Adicionar ao stats
const totalDamagedUnits = products.reduce((sum, p) => sum + (p.damaged_stock || 0), 0);
const productsWithDamages = products.filter(p => (p.damaged_stock || 0) > 0).length;
```

## Consistência nos Exports
Todos os exports CSV/Excel devem incluir uma coluna "Avarias" para os produtos que tenham `damaged_stock > 0`.
