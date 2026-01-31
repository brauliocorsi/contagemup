

# Ferramenta de Correcção de Stock em Massa

## Objectivo

Criar uma ferramenta segura e auditável que permita corrigir múltiplos produtos de uma só vez, com:
- Pré-visualização das alterações antes de confirmar
- Registo de auditoria completo
- Opção de importar correcções via ficheiro
- Validação de dados e confirmação do utilizador

---

## Interface Proposta

A nova ferramenta será adicionada ao **Relatório de Integridade** (tab "Integridade") como um novo botão "Corrigir Stock".

### Fluxo do Utilizador

```text
1. Utilizador clica em "Corrigir Stock"
2. Abre um diálogo com duas opções:
   - Corrigir produtos com discrepâncias (auto-detectados)
   - Importar lista de correcções (CSV/Excel)
3. Vê pré-visualização: stock actual → stock novo
4. Confirma e escolhe o motivo ("Ajuste de inventário")
5. Sistema actualiza counts e regista em stock_movements
6. Toast de sucesso + refresh dos dados
```

---

## Componentes a Criar

### 1. `BulkStockCorrectionDialog.tsx`

Diálogo principal com:
- Tabs: "Discrepâncias" | "Importar"
- Tabela com produtos a corrigir
- Coluna de "stock actual" e "stock correcto"
- Input para alterar valores individualmente
- Checkbox para seleccionar/desseleccionar produtos
- Resumo: X produtos, total de ajustes
- Botões: Cancelar | Confirmar Correcções

### 2. Integração no `StockIntegrityReport.tsx`

- Adicionar botão "Corrigir Stock" na barra de acções
- Passar lista de discrepâncias para o diálogo

---

## Lógica de Correcção (Segura)

Para cada produto seleccionado:

```text
1. Calcular diferença: novo_stock - stock_actual
2. Se diferença > 0: criar stock_movement tipo "entrada"
3. Se diferença < 0: criar stock_movement tipo "saida"
4. Actualizar tabela counts para TODOS os colis (igual ao novo_stock)
5. Registar em product_changes (auditoria)
```

### Vantagens desta abordagem:
- ✅ Auditoria completa (stock_movements)
- ✅ Triggers recalculam current_stock automaticamente
- ✅ Histórico preservado
- ✅ Reversível via histórico

---

## Ficheiros a Criar/Modificar

| Ficheiro | Alteração |
|----------|-----------|
| `src/components/reports/BulkStockCorrectionDialog.tsx` | **NOVO** - Diálogo de correcção em massa |
| `src/components/reports/StockIntegrityReport.tsx` | Adicionar botão e integração do diálogo |

---

## Detalhes Técnicos

### Estrutura do Diálogo

```tsx
interface CorrectionItem {
  productId: string;
  code: string;
  name: string;
  currentStock: number;   // Stock actual (da BD)
  targetStock: number;    // Stock correcto (input do user)
  difference: number;     // targetStock - currentStock
  selected: boolean;      // Para seleccionar/desseleccionar
}
```

### Fluxo de Importação

O ficheiro CSV/Excel deve ter colunas:
- `codigo` ou `code`
- `stock` ou `quantidade`

O sistema valida cada linha, mostra erros, e permite corrigir antes de confirmar.

### Lógica de Actualização

```typescript
// Para cada produto seleccionado
for (const item of selectedItems) {
  const difference = item.targetStock - item.currentStock;
  
  if (difference === 0) continue; // Sem alteração

  // 1. Registar movimento (auditoria)
  await supabase.from('stock_movements').insert({
    product_id: item.productId,
    movement_type: difference > 0 ? 'entrada' : 'saida',
    quantity: Math.abs(difference),
    reason: 'Ajuste de inventário',
    notes: `Correcção em massa: ${item.currentStock} → ${item.targetStock}`,
  });

  // 2. Actualizar counts para todos os colis
  for (let colis = 1; colis <= product.total_colis; colis++) {
    // Upsert no count com o novo valor
    await supabase.from('counts')
      .upsert({
        product_id: item.productId,
        colis_number: colis,
        quantity: item.targetStock,
        session_id: null, // Administrativo
      });
  }
}
```

### Segurança

- Todos os movimentos registados em `stock_movements`
- Notas indicam que foi "Correcção em massa"
- Utilizador autenticado registado em `created_by`
- Confirmação obrigatória antes de executar

---

## Interface Visual

```text
┌─────────────────────────────────────────────────────────────────┐
│  Correcção de Stock em Massa                              [X]  │
├─────────────────────────────────────────────────────────────────┤
│  [ Discrepâncias ]  [ Importar Ficheiro ]                       │
├─────────────────────────────────────────────────────────────────┤
│  ☑ Seleccionar todos (15 produtos)                              │
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ ☑  FER2 - Baliza para sistema elevatório                  │ │
│  │    Stock BD: 1232    →    Stock Correcto: [1037]  (-195)  │ │
│  ├────────────────────────────────────────────────────────────┤ │
│  │ ☑  FER1 - Amortecedor de sistema elevatório               │ │
│  │    Stock BD: 760     →    Stock Correcto: [570]   (-190)  │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│  15 produtos seleccionados | Total: -450 unidades               │
│                                                                 │
│  ⚠️ Esta acção irá criar movimentos de stock e actualizar       │
│     as contagens. Todas as alterações ficam registadas.         │
│                                                                 │
│              [ Cancelar ]          [ Confirmar Correcções ]     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Resultado Esperado

- Ferramenta integrada no relatório de Integridade
- Permite corrigir múltiplos produtos de uma só vez
- Cria registo de auditoria para cada alteração
- Preserva histórico e permite reversão
- Suporta importação de ficheiro para correcções em massa

