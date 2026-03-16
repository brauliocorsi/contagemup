

## Otimização Semanal de Rotas

### O que vai fazer

Um botão "Otimizar Semana" no `WeeklyRouteOptimizer` que:

1. **Analisa todas as paragens da semana** e sugere reagrupamentos mais eficientes por proximidade geográfica (código postal / coordenadas)
2. **Otimiza a ordem de cada rota individual** usando nearest-neighbor TSP, respeitando ponto de saída e volta à base
3. Apresenta um painel de **comparação antes/depois** com km estimados

### Fluxo do utilizador

1. Abre "Vista Semanal" nas Rotas
2. Clica "Otimizar Semana"
3. O sistema analisa todas as paragens com coordenadas e:
   - Agrupa paragens por proximidade geográfica (clustering por distância haversine)
   - Identifica paragens de rotas diferentes que ficam próximas e sugere juntar
   - Reordena cada rota pelo trajeto mais curto (nearest-neighbor com ponto de saída/volta)
4. Mostra um diálogo com as sugestões:
   - Resumo: km antes vs km depois
   - Lista de movimentos sugeridos (ex: "Mover cliente X da Rota A para Rota B")
   - Ordem otimizada dentro de cada rota
5. O utilizador aceita ou rejeita as sugestões
6. Ao aceitar, atualiza `route_stops` (route_id e order_number) na base de dados

### Alterações técnicas

**`src/components/routes/WeeklyRouteOptimizer.tsx`**
- Adicionar botão "Otimizar Semana" no header
- Estado para controlar o diálogo de otimização

**Novo: `src/components/routes/WeeklyOptimizationDialog.tsx`**
- Diálogo que recebe todas as rotas e paragens da semana
- Algoritmo de otimização client-side:
  - **Clustering**: Agrupa paragens próximas (< 15km) que estão em rotas diferentes no mesmo dia, sugerindo consolidação
  - **TSP nearest-neighbor**: Para cada rota, calcula a ordem ótima começando pelo ponto de saída (departure) da rota, e terminando com volta à base se configurado
  - **Cálculo de economia**: Compara distância total antes vs depois
- UI com:
  - Cards por rota mostrando ordem atual vs sugerida
  - Badge de "Mover para Rota X" em paragens que devem trocar de rota
  - Resumo de km economizados
  - Botões "Aplicar" e "Cancelar"

**Algoritmo de otimização (nearest-neighbor TSP)**:
```text
Para cada rota:
  1. Ponto inicial = departure da rota (ou primeira paragem)
  2. Repetir até todas visitadas:
     - Escolher paragem não visitada mais próxima
     - Adicionar à sequência
  3. Se return_to_base: adicionar distância de volta
  4. Calcular distância total
```

**Algoritmo de sugestão de reagrupamento**:
```text
Para cada dia da semana:
  1. Juntar todas as paragens de todas as rotas desse dia
  2. Para cada par de paragens em rotas diferentes:
     - Se distância < 15km, sugerir mover para a rota com mais paragens próximas
  3. Priorizar manter paragens na sua rota original quando a economia é marginal
```

**Aplicação das mudanças** (ao aceitar):
- Atualizar `route_id` das paragens que mudam de rota
- Atualizar `order_number` de todas as paragens reordenadas
- Invalidar queries de route-stops e route-schedules

### Sem alterações de base de dados
Toda a lógica usa as tabelas existentes (`route_schedules`, `route_stops`). Apenas updates a `route_id` e `order_number`.

