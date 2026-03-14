

# Reformulação Completa do Sistema de Rotas

## Resumo dos 3 Módulos

### Modulo 1: Rotas Regionais por Codigo Postal
Criar regioes (ex: "Porto", "Lisboa Norte") associadas a prefixos de codigos postais (ex: 4000-4999). Ao gerar uma rota para uma regiao, o sistema busca vendas disponiveis, filtra as que pertencem aquela regiao pelo codigo postal, geocodifica e ordena por proximidade.

### Modulo 2: Otimizador Semanal
Vista semanal com todas as rotas da semana. Permite arrastar vendas entre dias, ver sobreposicoes geograficas e sugerir reagrupamentos para reduzir distancia total.

### Modulo 3: URL Publica de Consulta
Edge function publica que recebe um codigo postal e devolve o melhor dia de entrega com base nas regioes configuradas e rotas existentes.

---

## Alteracoes na Base de Dados

### Nova tabela: `delivery_regions`
```sql
CREATE TABLE delivery_regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,                    -- "Porto", "Minho"
  postal_prefix_start text NOT NULL,     -- "4000"
  postal_prefix_end text NOT NULL,       -- "4999"
  default_weekday integer,               -- 0=Dom..6=Sab (dia preferencial)
  color text DEFAULT '#3B82F6',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```
RLS: authenticated CRUD.

### Alterar `route_schedules`
Adicionar coluna `region_id uuid REFERENCES delivery_regions(id)` (nullable) para associar rotas a regioes.

### Alterar `route_stops`
Adicionar coluna `freguesia text`, `municipio text` para guardar dados da GeoAPI.

---

## Modulo 1: Rotas Regionais

### Componentes novos:
- **`RegionsConfig.tsx`** - CRUD de regioes com nome, range de codigos postais (ex: 4000-4999), dia da semana preferencial e cor
- **`RegionalRouteBuilder.tsx`** - Substitui o `SuggestRouteDialog`. Fluxo:
  1. Selecionar regiao
  2. Selecionar estados de venda (como atual)
  3. Sistema busca vendas + clientes, filtra por codigo postal na regiao
  4. Geocodifica com GeoAPI.pt, agrupa por proximidade (nearest-neighbor)
  5. Mostra lista + mapa, permite selecionar/deselecionar
  6. Criar rota com data e nome

### Logica de matching:
```
postalPrefix = parseInt(postalCode.substring(0, 4))
match = postalPrefix >= region.postal_prefix_start 
     && postalPrefix <= region.postal_prefix_end
```

### Componentes alterados:
- **`RoutesView.tsx`** - Adicionar tab/filtro por regiao, botao "Configurar Regioes"
- **`RoutesList.tsx`** - Mostrar badge da regiao com cor
- **`RouteDetail.tsx`** - Mostrar freguesia/municipio em cada paragem

---

## Modulo 2: Otimizador Semanal

### Componente novo:
- **`WeeklyRouteOptimizer.tsx`** - Vista com 7 colunas (Seg-Dom), cada coluna mostra as rotas/paragens do dia. Permite:
  - Ver distancia total de cada rota
  - Identificar paragens isoladas que ficariam melhor noutro dia
  - Sugerir movimentacao de paragens entre dias (baseado em proximidade geografica a outras paragens do mesmo dia)
  - Botao "Otimizar Semana" que sugere redistribuicao

### Logica:
- Para cada paragem de cada rota, calcular distancia media as outras paragens da mesma rota vs rotas de outros dias
- Se uma paragem fica mais proxima de outra rota, sugerir transferencia
- Apresentar ganho estimado em km

---

## Modulo 3: URL Publica

### Edge Function: `delivery-day-lookup`
- Endpoint publico (sem auth)
- `GET /delivery-day-lookup?cp=4620-695`
- Resposta:
```json
{
  "postal_code": "4620-695",
  "region": "Porto / Minho",
  "suggested_day": "terça-feira",
  "next_delivery_date": "2026-03-17",
  "freguesia": "Lousada",
  "municipio": "Lousada"
}
```
- Logica: buscar regiao pelo prefixo postal, devolver `default_weekday`, calcular proxima data

### Config TOML:
```toml
[functions.delivery-day-lookup]
verify_jwt = false
```

---

## Ficheiros a criar/alterar

| Ficheiro | Acao |
|---|---|
| `src/components/routes/RegionsConfig.tsx` | Criar - CRUD regioes |
| `src/components/routes/RegionalRouteBuilder.tsx` | Criar - builder de rotas regionais |
| `src/components/routes/WeeklyRouteOptimizer.tsx` | Criar - otimizador semanal |
| `src/hooks/useDeliveryRegions.tsx` | Criar - hook para regioes |
| `supabase/functions/delivery-day-lookup/index.ts` | Criar - endpoint publico |
| `src/components/routes/RoutesView.tsx` | Alterar - adicionar tabs e novos botoes |
| `src/components/routes/RouteDetail.tsx` | Alterar - mostrar freguesia/municipio |
| `src/components/routes/RoutesList.tsx` | Alterar - badge de regiao |
| `src/hooks/useRoutes.tsx` | Alterar - incluir region_id |
| Migration SQL | Criar tabela + alterar existentes |

### Ordem de implementacao:
1. Migration DB (tabela regioes + colunas novas)
2. Hook `useDeliveryRegions` + `RegionsConfig`
3. `RegionalRouteBuilder` (substitui SuggestRouteDialog)
4. Atualizar `RoutesView`, `RoutesList`, `RouteDetail`
5. `WeeklyRouteOptimizer`
6. Edge function `delivery-day-lookup`

