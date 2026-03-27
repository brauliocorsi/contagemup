

# Correcção de Dados Históricos do Bug Pré-v1.2.0

## Contexto
O bug antigo nas funções `incrementCountAtLocation`/`decrementCountAtLocation` criou registos falsos em `stock_movements` (entradas/saídas de 1 unidade por cada ajuste individual de coli) e fez updates manuais incorrectos ao `current_stock`. O código já foi corrigido na v1.2.0, mas os dados históricos permanecem corrompidos.

## O que será feito

### 1. Criar ferramenta de limpeza na área de Definições
Adicionar um novo botão "Corrigir Dados Históricos" no card "Gestão de Dados" do `SettingsView.tsx`, ao lado do botão de Reset existente. Abre um novo dialog `StockDataRepairDialog`.

### 2. Criar `StockDataRepairDialog.tsx`
Dialog com as seguintes acções automáticas (com progresso visual):

**Fase 1 — Identificar e remover movimentos falsos**
- Identificar `stock_movements` que foram criados pelo bug: movimentos de quantidade 1 com reason `'Contagem'` ou `'Ajuste de localização'` ou sem reason, que coincidem em timestamp com um `count_log` do mesmo produto (dentro de 5 segundos de diferença)
- Alternativamente, abordagem mais segura: apresentar um relatório dos movimentos suspeitos antes de apagar, permitindo ao utilizador confirmar

**Fase 2 — Recalcular stock de todos os produtos**
- Chamar a função de base de dados `recalculate_all_stock()` que já existe — percorre todos os produtos e recalcula `current_stock` baseado no mínimo entre todos os colis na tabela `counts`

**Fase 3 — Mostrar resumo**
- Mostrar quantos movimentos falsos foram removidos
- Mostrar quantos produtos tiveram o stock corrigido

### 3. Abordagem segura: Relatório antes da acção
Seguindo a metodologia existente (diagnóstico → aprovação → aplicação):
- **Passo 1**: Botão "Diagnosticar" gera relatório mostrando movimentos suspeitos e produtos com stock potencialmente incorreto
- **Passo 2**: Botão "Aplicar Correcções" só fica disponível após diagnóstico, com confirmação por texto "CORRIGIR"

### 4. Migração: Adicionar função de limpeza
Criar uma função de base de dados `cleanup_false_movements()` que:
- Apaga registos de `stock_movements` com `quantity = 1` e `reason IS NULL` que têm um `count_log` correspondente no mesmo produto dentro de poucos segundos
- Retorna o número de registos apagados

### 5. Recalcular stock
Após a limpeza, executar `recalculate_all_stock()` para garantir que todos os `current_stock` reflectem o mínimo real entre colis.

### 6. Bump versão
Actualizar para `v1.3.0`.

## Ficheiros a criar/modificar
- **Criar** `src/components/settings/StockDataRepairDialog.tsx` — dialog com diagnóstico + limpeza
- **Editar** `src/components/settings/SettingsView.tsx` — adicionar botão e import do novo dialog
- **Migração SQL** — função `cleanup_false_movements()` 
- **Editar** `src/version.ts` — bump para v1.3.0

## Detalhes técnicos

A identificação de movimentos falsos usa a seguinte lógica SQL:
```text
stock_movements WHERE quantity = 1 
  AND reason IS NULL 
  AND EXISTS (
    count_log com mesmo product_id 
    e created_at dentro de ±10 segundos
  )
```

A recalculação usa a função `recalculate_all_stock()` já existente no banco, que calcula `MIN(SUM(quantity))` por coli para cada produto.

