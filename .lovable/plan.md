

# Reset de Stock - Começar Contagem do Zero

## Resumo da Operação

Vamos limpar todos os dados de movimentação e stock, mantendo a estrutura dos produtos:

### O que será MANTIDO ✅
| Dados | Descrição |
|-------|-----------|
| **Produtos** | 491 produtos com código, nome, categoria |
| **Localizações** | Campo `location` de cada produto |
| **Paletes** | Campo `pallet_number` de cada produto |
| **Número de Colis** | Campo `total_colis` de cada produto |
| **Categorias** | Todas as categorias e configurações |
| **Configuração Armazém** | Corredores, níveis, localizações, paletes |
| **Utilizadores** | Profiles mantidos |

### O que será APAGADO 🗑️
| Tabela | Registos | Descrição |
|--------|----------|-----------|
| `counts` | 1.401 | Contagens de stock (quantidades) |
| `count_logs` | 2.378 | Histórico de incrementos/decrementos |
| `stock_movements` | 623 | Movimentos de entrada/saída |
| `picking_items` | 66 | Itens de picking |
| `picking_sessions` | 36 | Sessões de picking |
| `counting_sessions` | 2 | Sessões de contagem |
| `product_changes` | 444 | Histórico de alterações de produtos |
| `product_damages` | 1 | Relatórios de danos |

### O que será ZERADO
| Campo | Descrição |
|-------|-----------|
| `products.current_stock` | Será definido como 0 |
| `products.damaged_stock` | Será definido como 0 |

---

## Plano de Execução

A operação será feita através de SQL executado directamente na base de dados. A ordem é importante para respeitar as foreign keys.

### Passo 1: Apagar Tabelas Dependentes (sem foreign keys de outras)

```sql
-- Apagar itens de picking primeiro (depende de picking_sessions)
DELETE FROM picking_items;

-- Apagar logs de contagem (depende de counting_sessions e products)
DELETE FROM count_logs;

-- Apagar itens de reconciliação (depende de reconciliations)
DELETE FROM reconciliation_items;

-- Apagar itens de auditoria (depende de location_audits)
DELETE FROM location_audit_items;
```

### Passo 2: Apagar Tabelas Principais

```sql
-- Apagar contagens (a fonte principal do stock)
DELETE FROM counts;

-- Apagar movimentos de stock
DELETE FROM stock_movements;

-- Apagar sessões de picking
DELETE FROM picking_sessions;

-- Apagar sessões de contagem
DELETE FROM counting_sessions;

-- Apagar reconciliações
DELETE FROM reconciliations;

-- Apagar auditorias de localização
DELETE FROM location_audits;

-- Apagar histórico de alterações de produtos
DELETE FROM product_changes;

-- Apagar relatórios de danos
DELETE FROM product_damages;
```

### Passo 3: Zerar Stock nos Produtos

```sql
-- Zerar current_stock e damaged_stock mantendo location, pallet_number e total_colis
UPDATE products 
SET 
  current_stock = 0,
  damaged_stock = 0,
  updated_at = now();
```

---

## Implementação Técnica

Vou criar uma página ou função de administração que execute estas operações com confirmação do utilizador.

### Ficheiro: `src/components/settings/ResetStockDialog.tsx`

Novo componente com:
- Diálogo de confirmação com resumo do que será apagado
- Campo de confirmação (escrever "CONFIRMAR" para activar)
- Botão de reset desabilitado até confirmação
- Feedback de progresso durante execução
- Toast de sucesso/erro no final

### Ficheiro: `src/components/settings/SettingsView.tsx`

Adicionar secção "Gestão de Dados" com:
- Botão "Reset de Stock" que abre o diálogo
- Apenas visível para administradores

---

## Segurança

1. **Confirmação obrigatória** - Utilizador deve escrever "CONFIRMAR"
2. **Apenas admins** - Verificar role do utilizador
3. **Sem reversão** - Aviso claro que a operação é irreversível
4. **Backup recomendado** - Sugestão para exportar dados antes

---

## Resultado Final

Após a operação:
- Todos os produtos terão `current_stock = 0`
- Localizações e paletes mantidos nos produtos
- Sistema pronto para nova contagem de inventário
- Histórico completamente limpo

