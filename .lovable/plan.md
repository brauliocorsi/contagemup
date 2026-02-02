
# Reestruturação de Relatórios e Sistema de Conferência de Localizações

## Resumo

Simplificar a estrutura de relatórios actual (5 abas) para uma interface mais focada (3 abas), adicionar rastreabilidade de utilizadores em todas as operações, e criar um novo sistema de conferência de stock por localização.

---

## Parte 1: Nova Estrutura de Relatórios

### Antes (5 abas)
- Integridade
- Movimentos
- Encomendas
- Contagem
- Sessão

### Depois (3 abas)
1. **Movimentos** - Relatório unificado de todas as operações
2. **Stock** - Produtos completos, incompletos e avarias
3. **Conferência** - Histórico de conferências de localização

---

## Parte 2: Relatório Unificado de Movimentos

### Fontes de Dados Unificadas

| Tipo | Origem | Classificação |
|------|--------|---------------|
| Entrada manual | `stock_movements` | Entrada |
| Saída manual | `stock_movements` | Saída |
| Incremento contagem | `count_logs` | Adição |
| Decremento contagem | `count_logs` | Remoção |
| Picking | `picking_items` | Saída |

### Filtros Disponíveis
- **Tipo de movimento**: Todos / Entradas / Saídas / Adições / Remoções
- **Período**: Data início e fim
- **Pesquisa**: Código, nome do produto, utilizador
- **Funcionário**: Filtro por quem executou

### Colunas da Tabela
| Data/Hora | Tipo | Produto | Quantidade | Funcionário | Origem | Notas |

### Indicadores Visuais
- Entradas/Adições: Verde com seta para cima
- Saídas/Remoções: Vermelho com seta para baixo
- Badge com origem (Manual, Contagem, Picking)

---

## Parte 3: Relatório de Stock

### Secção 1 - Produtos Completos
Tabela com produtos que têm stock disponível:
- Código, Nome, Categoria
- Sets Completos
- Total de Unidades
- Localizações

### Secção 2 - Produtos Incompletos
Tabela com produtos desbalanceados (colis em falta):
- Código, Nome
- Sets Mínimos vs Máximos
- Colis em falta (com nomes)
- Excedentes

### Secção 3 - Avarias
Resumo integrado de avarias activas:
- Produtos afetados
- Unidades danificadas
- Tipos de dano

### Exportação
- Excel/CSV com todas as secções em separadores

---

## Parte 4: Sistema de Conferência de Localizações

### Nova Tabela na Base de Dados

```sql
CREATE TABLE location_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  locations TEXT[] NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_by UUID REFERENCES auth.users(id),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE location_audit_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID REFERENCES location_audits(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  product_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  location TEXT NOT NULL,
  pallet_number TEXT,
  colis_number INTEGER,
  expected_quantity INTEGER NOT NULL,
  counted_quantity INTEGER,
  difference INTEGER,
  status TEXT DEFAULT 'pending',
  counted_by UUID,
  counted_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Fluxo de Trabalho

```text
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  1. CRIAR       │     │  2. EXECUTAR    │     │  3. RELATÓRIO   │
│  CONFERÊNCIA    │────▶│  CONFERÊNCIA    │────▶│  DIFERENÇAS     │
│                 │     │                 │     │                 │
│  - Selecionar   │     │  - Lista de     │     │  - Comparar     │
│    localizações │     │    produtos     │     │    esperado vs  │
│  - Dar nome     │     │  - Contar cada  │     │    contado      │
│                 │     │    um           │     │  - Exportar     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### Interface: Criar Conferência

No mapa do armazém ou lista de localizações:
- Checkbox para seleccionar múltiplas localizações
- Botão "Iniciar Conferência"
- Dialog para dar nome à conferência

### Interface: Executar Conferência

Tela dedicada estilo "picking":
```text
┌──────────────────────────────────────────────────────────────┐
│  CONFERÊNCIA: "Rua A - Fev 2026"           Progresso: 5/12  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  📍 A1-01  |  📦 PLT-032                              │  │
│  ├────────────────────────────────────────────────────────┤  │
│  │                                                        │  │
│  │  Produto: CAMA-001 - Cama Casal Premium               │  │
│  │  Coli: 1/3 - Base                                     │  │
│  │                                                        │  │
│  │  Esperado: 5 unidades                                 │  │
│  │                                                        │  │
│  │  Contado:  [    5    ]  ✓ Confirmar                   │  │
│  │                                                        │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  📍 A1-01  |  📦 PLT-032                              │  │
│  ├────────────────────────────────────────────────────────┤  │
│  │  Produto: MESA-005 - Mesa Jantar 6 Lugares            │  │
│  │  Esperado: 3 unidades                                 │  │
│  │                                                        │  │
│  │  Contado:  [    2    ]  ✓ Confirmar   ⚠ Diferença    │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  [← Anterior]                              [Próximo →]       │
│                                                              │
│  [Finalizar Conferência]                                     │
└──────────────────────────────────────────────────────────────┘
```

### Interface: Relatório de Conferência

Após finalizar, mostrar:
- Resumo: Total conferido, Correctos, Com diferença
- Tabela de diferenças com filtro
- Exportar para Excel

---

## Parte 5: Rastreabilidade de Utilizadores

### Dados Já Rastreados
- `stock_movements.created_by` - Entradas/Saídas manuais
- `count_logs.counted_by` - Operações de contagem
- `picking_sessions.created_by` - Sessões de picking
- `product_damages.reported_by` - Reportes de avaria

### Melhorias Necessárias
Garantir que todos os registos mostram o nome do utilizador:
- Carregar nomes de `profiles` para exibição
- Adicionar coluna "Funcionário" em todas as tabelas

---

## Ficheiros a Criar

| Ficheiro | Descrição |
|----------|-----------|
| `src/components/reports/UnifiedMovementsReport.tsx` | Relatório unificado de movimentos |
| `src/components/reports/StockStatusReport.tsx` | Relatório de stock (completos/incompletos/avarias) |
| `src/components/reports/AuditReportsView.tsx` | Lista de conferências realizadas |
| `src/components/audit/CreateAuditDialog.tsx` | Dialog para criar conferência |
| `src/components/audit/AuditExecutionView.tsx` | Tela de execução da conferência |
| `src/components/audit/AuditResultsDialog.tsx` | Resultados e diferenças |
| `src/hooks/useLocationAudits.tsx` | Hook para gestão de conferências |

## Ficheiros a Modificar

| Ficheiro | Alteração |
|----------|-----------|
| `src/components/reports/ReportsView.tsx` | Reestruturar para 3 abas |
| `src/components/warehouse/WarehouseMapView.tsx` | Adicionar aba "Conferência" |
| `src/components/warehouse/InteractiveWarehouseMap.tsx` | Adicionar selecção multi-localização |
| `src/pages/Dashboard.tsx` | Adicionar rota para execução de conferência |
| `src/components/layout/Navigation.tsx` | Opcional: Adicionar acesso rápido a conferências activas |

## Migração de Base de Dados

Criar tabelas `location_audits` e `location_audit_items` com políticas RLS apropriadas para utilizadores autenticados.

---

## Resultado Final

1. **Relatórios simplificados** - De 5 para 3 abas focadas
2. **Visão unificada de movimentos** - Todas as operações num só lugar
3. **Rastreabilidade completa** - Sempre visível quem fez cada operação
4. **Sistema de conferência** - Workflow completo para auditar localizações
5. **Comparação automática** - Esperado vs Contado com diferenças destacadas
