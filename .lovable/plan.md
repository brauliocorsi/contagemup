# Refactor UX/UI — UP Contagem

Direção: **Ocean Deep** + **Urbanist/Epilogue** + **Sidebar layout**. Foco em clareza e hierarquia. Zero mudanças de funcionalidade — só apresentação.

## Etapa 1 — Design system (tokens)

Substituir tokens em `src/index.css` e `tailwind.config.ts`:

- **Cores (light)**: background `#f7fafb`, surface `#ffffff`, primary `#1a4a6e` (navy médio), primary-glow `#2d8a9e` (teal), accent `#5cbdb9` (mint), foreground `#0c2340` (navy profundo). Sidebar em navy profundo (`#0c2340`) com foreground claro.
- **Cores (dark)**: background `#0c2340`, surface `#12314f`, primary `#5cbdb9`, foreground `#e8f4f5`.
- **Tipografia**: swap Google Fonts para `Urbanist` (heading, 500-700) + `Epilogue` (body, 400-600). Atualizar `--font-heading` e `--font-sans`.
- **Radius**: `0.75rem` (mais suave, moderno).
- **Sombras**: refinar `--shadow-sm/md/lg` com tint navy em vez de neutro.
- **Semantic states**: manter success/warning/danger/info, ajustar hues para harmonizar com teal.

## Etapa 2 — App shell: migrar top-nav → sidebar

Novo shell em `src/App.tsx` (ou wrapper `AppLayout`):

```
┌─────────────────────────────────────────┐
│ Sidebar │  Header (trigger + user + …)  │
│  logo   ├───────────────────────────────┤
│  nav    │                               │
│  ...    │        <Outlet />             │
│  user   │                               │
└─────────┴───────────────────────────────┘
```

- Criar `src/components/layout/AppSidebar.tsx` com `Sidebar` (shadcn) colapsível `collapsible="icon"`.
- Grupos: **Operação** (Dashboard, Contagem, Entradas, Saídas), **Catálogo** (Produtos, Avarias, Categorias), **Integração** (ERP, Rotas, Compras), **Análise** (Relatórios, Armazém), **Sistema** (Settings).
- Item ativo destacado com `NavLink` + `useLocation`. Estado colapsado mostra só ícones.
- `SidebarTrigger` fica no header (sempre visível).
- `src/components/layout/Header.tsx`: reduzir para trigger + breadcrumb/título da página + busca global + user menu. Remover navegação horizontal.
- **Remover** `src/components/layout/Navigation.tsx` (substituído pela sidebar).
- Ajustar `src/pages/Dashboard.tsx` para renderizar dentro do novo shell.

Nota técnica: o projeto usa navegação por state (não react-router com rotas reais para cada vista). Vou preservar isso — a sidebar dispara o mesmo estado de vista atual, sem migração de routing.

## Etapa 3 — Primitivos compartilhados

- `PageHeader`: já existe; refinar com breadcrumb opcional e melhor tratamento de actions.
- `StatCard`: unificar variantes (default/success/warning/danger/info) e adicionar sparkline opcional.
- `FilterBar`: revisar densidade e alinhamento em todas as vistas que usam.
- `EmptyState` (novo): componente reutilizável para listas vazias.
- `SectionCard` (novo): wrapper card com header + descrição para agrupar conteúdo dentro de páginas.

## Etapa 4 — Refactor por vista (só apresentação)

Passar por cada vista aplicando: `PageHeader` consistente, tokens semânticos (zero `text-white`/`bg-black`/hex), spacing uniforme (`space-y-6`), tabelas com zebra sutil, badges harmonizados. Sem mudar hooks nem lógica.

1. **Dashboard** (`DashboardHome.tsx`) — já iniciado, refinar KPIs e seções recentes.
2. **Contagem** (`CountingView`, `CountingHeader`, `ProductCard`, `CountingFilters`, `CountingSummary`) — reduzir ruído, hierarquizar contadores.
3. **Entradas** (`StockEntriesView`) — polir carrinho de coli + painel recentes.
4. **Saídas** (`StockExitsView`) — polir carrinho + badges de recomendação.
5. **Produtos** (`ProductsView`, `RecentProductsView`, dialogs) — tabela mais leia, ações agrupadas.
6. **Avarias** (`DamagesView`, `DamagesTable`, dialogs) — status com cores semânticas coerentes.
7. **Categorias** (`CategoriesView`).
8. **ERP** (`ERPReconciliationView`, `ERPExitsView`, `PendingSalesView`, `CancellationsView`).
9. **Rotas** (`RoutesView`, `RoutesList`, `RouteDetail`, `RouteMap`, dialogs) — mapa mantém libs; só chrome à volta.
10. **Compras** (`PurchaseOrdersView`).
11. **Relatórios** (`ReportsView` e sub-relatórios) — cards de gráficos consistentes.
12. **Armazém** (`WarehouseMapView`, `InteractiveWarehouseMap`, configs) — legends e controls polidos.
13. **Sessões** (`SessionsView`).
14. **Settings** (`SettingsView`, `ProfileSettings`, `ResetStockDialog`).
15. **Login** (`LoginForm`) — hero split com paleta Ocean Deep.

## Etapa 5 — Detalhes finais

- Toasts (sonner): tema navy/teal, ícones consistentes.
- Dialogs/Sheets: header padronizado, footers alinhados.
- Estados de loading: skeletons em vez de spinners onde faz sentido.
- Focus rings: teal `--ring` com boa visibilidade.
- Dark mode: garantir contraste em todas as vistas.

## Detalhes técnicos

- Nenhuma mudança em hooks (`useProducts`, `useCounting`, etc.), RPCs, RLS, edge functions ou tipos.
- Nenhuma alteração de rotas/navegação lógica — só a apresentação da navegação muda (top → sidebar).
- `RealtimeSyncProvider` e providers permanecem intactos.
- Preservar acessibilidade: aria-labels em botões-ícone, contraste AA.
- Verificação: build + Playwright screenshots por vista após aplicar.

## Ordem de execução

Etapa 1 → 2 → 3 → 4 (por blocos de 3-4 vistas com verificação visual entre blocos) → 5.

Confirma para começar pela Etapa 1 (design tokens + fontes) e Etapa 2 (sidebar shell), que são a base de tudo o resto.