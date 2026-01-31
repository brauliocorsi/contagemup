

# Plano de Melhorias: Performance e Optimização do Sistema

## Diagnóstico Actual

Após análise detalhada do código, identifiquei as seguintes áreas críticas que afectam a performance:

| Área | Problema | Impacto |
|------|----------|---------|
| Carregamento inicial | Todos os componentes são carregados de uma só vez | Alto - lentidão ao abrir |
| Hooks duplicados | Múltiplos hooks fazem as mesmas queries em paralelo | Alto - sobrecarga de rede |
| Falta de memoização | Cálculos complexos recalculados em cada render | Médio - lags de UI |
| Componentes grandes | ProductCard.tsx (783 linhas), CountingView (1212 linhas) | Médio - manutenção difícil |
| Queries sem paginação | `useLastCounts` busca TODOS os counts | Alto - ~1400+ registros |
| React-Query mal configurado | Alguns hooks usam `useState` + `useEffect` em vez de React-Query | Médio - cache ineficiente |

### Dados Actuais do Sistema:
- **489 produtos** cadastrados
- **1427 contagens** (counts)
- **2 sessões** activas
- **44 itens de picking**

---

## Fase 1: Optimização de Performance Crítica

### 1.1 Code Splitting e Lazy Loading (Impacto: Alto)

Implementar carregamento preguiçoso para cada aba/view principal.

**Ficheiros a modificar:**
- `src/pages/Dashboard.tsx`

**Alterações:**
```typescript
// De:
import { CountingView } from '@/components/counting/CountingView';
import { ProductsView } from '@/components/products/ProductsView';
// ... todos os imports

// Para:
const CountingView = React.lazy(() => import('@/components/counting/CountingView'));
const ProductsView = React.lazy(() => import('@/components/products/ProductsView'));
// etc...

// E envolver com Suspense:
<Suspense fallback={<LoadingSkeleton />}>
  {activeTab === 'counting' && <CountingView />}
</Suspense>
```

**Resultado esperado:** Redução de ~60% no tempo de carregamento inicial

---

### 1.2 Refactoring de Hooks para React-Query (Impacto: Alto)

Migrar hooks que usam `useState` + `useEffect` para React-Query:

**Hooks a refactorizar:**
| Hook | Problema | Solução |
|------|----------|---------|
| `useCategories` | Usa useState/useEffect | Migrar para useQuery |
| `useSessions` | Usa useState/useEffect | Migrar para useQuery |
| `useLastCounts` | Busca TODOS os dados sem paginação | Adicionar paginação + useQuery |

**Exemplo de refactoring para `useCategories.tsx`:**
```typescript
// De:
const [categories, setCategories] = useState<Category[]>([]);
const [loading, setLoading] = useState(true);

useEffect(() => {
  fetchCategories();
}, []);

// Para:
const { data: categories = [], isLoading: loading } = useQuery({
  queryKey: ['categories'],
  queryFn: async () => {
    const { data, error } = await supabase.from('categories').select('*').order('name');
    if (error) throw error;
    return (data || []).map(mapToCategory);
  },
  staleTime: 5 * 60 * 1000, // 5 minutos - categorias mudam raramente
});
```

**Resultado esperado:** Cache eficiente, menos requisições duplicadas

---

### 1.3 Paginação e Virtualização (Impacto: Alto)

**Problema actual:** A lista de produtos carrega todos os 489 produtos de uma vez.

**Solução - Virtualização:**
```typescript
// Instalar: npm install @tanstack/react-virtual

// Em ProductsView.tsx:
import { useVirtualizer } from '@tanstack/react-virtual';

const rowVirtualizer = useVirtualizer({
  count: filteredProducts.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 60, // altura estimada de cada linha
});
```

**Solução - Paginação no useLastCounts:**
```typescript
// Buscar apenas counts da sessão activa, não todos
const { data: counts } = await supabase
  .from('counts')
  .select('...')
  .eq('session_id', activeSessionId) // FILTRAR!
  .order('counted_at', { ascending: false });
```

---

### 1.4 Memoização Agressiva (Impacto: Médio-Alto)

**Componentes a optimizar:**
- `ProductCard` - calcular dados derivados uma vez
- `CountingView` - memoizar filteredProducts e productsWithCounts
- `ProductsView` - memoizar cálculos de stock

**Exemplo:**
```typescript
// Em ProductCard.tsx, memoizar cálculos:
const derivedData = useMemo(() => ({
  statusIcon: getStatusIcon(),
  missingDescription: getMissingDescription(),
  colisDetails: product.colisDetails,
}), [product.completeSets, product.hasPartialProduct, product.missingForNextComplete]);
```

---

## Fase 2: Refactoring de Código

### 2.1 Dividir Componentes Grandes

| Ficheiro | Linhas | Acção |
|----------|--------|-------|
| `CountingView.tsx` | 1212 | Dividir em 4-5 componentes |
| `ProductCard.tsx` | 783 | Extrair sub-componentes |
| `ProductsView.tsx` | 1173 | Extrair tabela e filtros |
| `ManualStockSection.tsx` | 781 | Extrair lógica de carrinho |

**Estrutura proposta para CountingView:**
```text
CountingView/
├── index.tsx (main container, ~200 linhas)
├── CountingFilters.tsx
├── CountingProductList.tsx
├── CountingExportMenu.tsx
├── hooks/
│   └── useCountingFilters.ts
└── CountingSessionSelector.tsx
```

---

### 2.2 Criar Hook de Estado Global para Sessão

**Problema:** `selectedSessionId` é gerido localmente e passado via props.

**Solução:** Criar contexto de sessão:
```typescript
// src/contexts/SessionContext.tsx
export const SessionProvider = ({ children }) => {
  const [sessionId, setSessionId] = useState(() => 
    localStorage.getItem('counting_selected_session')
  );
  // ... lógica centralizada
};

export const useSessionContext = () => useContext(SessionContext);
```

---

## Fase 3: Optimização de Base de Dados

### 3.1 Criar Índices Optimizados

```sql
-- Índices para melhorar queries frequentes
CREATE INDEX IF NOT EXISTS idx_counts_product_session 
  ON counts(product_id, session_id);

CREATE INDEX IF NOT EXISTS idx_counts_session_counted_at 
  ON counts(session_id, counted_at DESC);

CREATE INDEX IF NOT EXISTS idx_products_category 
  ON products(category);

CREATE INDEX IF NOT EXISTS idx_stock_order_numbers_order_number 
  ON stock_order_numbers(order_number);
```

### 3.2 Optimizar Trigger `sync_product_stock`

O trigger actual faz múltiplas queries por produto. Pode ser optimizado para usar uma única query agregada.

---

## Fase 4: UX e Polimento

### 4.1 Loading States Melhorados

- Skeleton loaders específicos por secção
- Indicadores de progresso durante operações longas
- Cache optimista para operações CRUD

### 4.2 Prefetching Inteligente

```typescript
// Pré-carregar dados quando utilizador passa mouse sobre aba
const handleTabHover = (tab: string) => {
  queryClient.prefetchQuery({
    queryKey: ['tab-data', tab],
    queryFn: () => fetchTabData(tab),
  });
};
```

### 4.3 Debounce em Pesquisas

```typescript
// Já existe em ManualStockSection (300ms)
// Aplicar também em ProductsView e CountingView
const debouncedSearch = useDebouncedValue(searchTerm, 300);
```

---

## Resumo de Ficheiros a Modificar

| Ficheiro | Tipo de Alteração |
|----------|-------------------|
| `src/pages/Dashboard.tsx` | Lazy loading |
| `src/hooks/useCategories.tsx` | Migrar para React-Query |
| `src/hooks/useSessions.tsx` | Migrar para React-Query |
| `src/hooks/useLastCounts.tsx` | Paginação + React-Query |
| `src/components/counting/CountingView.tsx` | Dividir componente |
| `src/components/products/ProductsView.tsx` | Virtualização + memoização |
| `src/components/counting/ProductCard.tsx` | Dividir + memoização |
| Migração SQL | Índices |

---

## Ordem de Implementação Sugerida

1. **Semana 1: Quick Wins**
   - Lazy loading no Dashboard
   - Memoização nos componentes principais
   - Debounce em pesquisas

2. **Semana 2: Hooks**
   - Migrar useCategories para React-Query
   - Migrar useSessions para React-Query
   - Optimizar useLastCounts com filtro de sessão

3. **Semana 3: Refactoring**
   - Dividir CountingView
   - Dividir ProductCard
   - Criar SessionContext

4. **Semana 4: Base de Dados**
   - Criar índices
   - Optimizar triggers
   - Testes de carga

---

## Métricas de Sucesso

| Métrica | Actual (estimado) | Objectivo |
|---------|-------------------|-----------|
| Tempo de carregamento inicial | ~3-5s | < 1s |
| Time to Interactive | ~5s | < 2s |
| Re-renders por acção | Múltiplos | Mínimo necessário |
| Tamanho do bundle inicial | ~500KB | < 200KB |

---

## Secção Técnica Detalhada

### Configuração React-Query Optimizada

```typescript
// src/App.tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutos
      gcTime: 10 * 60 * 1000, // 10 minutos (antes era cacheTime)
      refetchOnWindowFocus: false, // Desabilitar refresh automático
      retry: 1, // Apenas 1 retry em caso de erro
    },
  },
});
```

### Estrutura de Lazy Loading

```typescript
// src/pages/Dashboard.tsx
import React, { Suspense, lazy } from 'react';

const CountingView = lazy(() => import('@/components/counting/CountingView').then(m => ({ default: m.CountingView })));
const ProductsView = lazy(() => import('@/components/products/ProductsView').then(m => ({ default: m.ProductsView })));
// ... outros imports lazy

const ViewLoader = () => (
  <div className="p-4 space-y-4">
    <Skeleton className="h-10 w-64" />
    <Skeleton className="h-32 w-full" />
    <Skeleton className="h-64 w-full" />
  </div>
);

// No render:
<Suspense fallback={<ViewLoader />}>
  {activeTab === 'counting' && <CountingView />}
  {activeTab === 'products' && <ProductsView />}
  {/* ... */}
</Suspense>
```

