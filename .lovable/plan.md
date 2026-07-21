# Refactor UI/UX — UP Contagem

**Regra dourada:** só código de apresentação. Zero mudanças em hooks de dados, RPCs, RLS, edge functions ou lógica de negócio. Funcionalidades ficam idênticas.

## Direção visual

- **Paleta Cloud White:** `#fafbfc` bg, `#e8ecf1` superfície, `#94a3b8` muted, `#3b82f6` primary. Sensação SaaS arejado, claro, com foco no dado.
- **Tipografia:** Space Grotesk (headings, números) + DM Sans (body/UI). Números tabulares (`font-variant-numeric: tabular-nums`) em tabelas de stock.
- **Densidade 3:** intermédia — respiração confortável mas sem ecrãs vazios. Row-height tabela ~44px, cards com padding 20px.
- **Border-radius:** 10px componentes, 14px cards, 8px inputs.
- **Sombras:** planas, uma única shadow-elegant subtil para elevação (evitar drop shadows pesadas).
- **Estado ativo/hover:** superfícies com tint de primary a baixa opacidade em vez de bordas fortes.

## Etapas

### 1. Design system (base de tudo)
- `src/index.css`: reescrever tokens HSL para Cloud White (light + dark coerente). Adicionar tokens semânticos: `--surface`, `--surface-elevated`, `--border-subtle`, `--success`, `--warning`, `--danger`, `--info`, gradients e shadow-elegant.
- `tailwind.config.ts`: registar fontes (`font-heading`, `font-sans`), estender `fontFamily`, `boxShadow`, `borderRadius`, cores semânticas novas.
- `index.html`: injetar Google Fonts (Space Grotesk 500/600/700 + DM Sans 400/500/600).
- Auditar componentes `src/components/ui/*` (shadcn) para garantir que usam apenas tokens — sem cores hardcoded.

### 2. Shell da app (layout + navegação)
- `SidebarProvider` / sidebar principal: novo visual — logo compacto no topo, grupos com labels finos uppercase, item ativo com pill de primary/10 + texto primary, ícones lucide 18px, colapsável mantendo estado.
- Header/topbar: breadcrumb esquerda, ações contextuais direita (sync ERP, notificações, user menu). Sticky com blur bg.
- Container principal com `max-w` responsivo e padding consistente.

### 3. Padrões repetidos (aplicados transversalmente)
- **PageHeader** unificado: título Space Grotesk + subtítulo muted + slot de ações — usado em todas as views.
- **StatCard** para KPIs (dashboard, relatórios): valor grande, label, delta/tendência, ícone.
- **DataTable wrapper**: header sticky, zebra subtil, hover suave, densidade fixa, empty-state e loading skeleton.
- **FilterBar**: campo search + selects + chips ativos + botão "limpar".
- **Dialogs/Sheets**: header com título+descrição, footer sticky com ações à direita, spacing consistente.
- **Toast/Sonner**: variantes success/warning/danger alinhadas aos novos tokens.
- **Empty states** e **loading skeletons** consistentes.

### 4. Vistas — pass visual (sem tocar em lógica)
Aplicar os padrões acima em, por ordem:
1. Dashboard / Index
2. Contagens (`CountingView` e filhos)
3. Entradas de Stock (`StockEntriesView`)
4. Saídas de Stock (`StockExitsView` — cart)
5. Produtos (lista + formulário)
6. Avarias (`DamagesView` + tabela)
7. ERP (Reconciliação, Saídas ERP, Cancelamentos, Compras)
8. Rotas / Entregas
9. Relatórios
10. Definições / Utilizadores

Para cada vista: PageHeader, FilterBar, DataTable/Cards, dialogs — mantendo props, handlers, queries e mutations exatamente como estão.

### 5. Micro-detalhes
- Badges de estado (contagem ativa, stock negativo, avaria por resolver) com paleta semântica consistente.
- Números com `tabular-nums`, valores negativos em `danger`, positivos em `success`.
- Ícones lucide harmonizados por área (armazém, ERP, rotas, avarias).
- Focus rings visíveis (acessibilidade) usando ring primary.
- Transições curtas (150ms) em hover/active — nada de animações longas.

### 6. QA visual
- Percorrer todas as rotas em desktop + tablet.
- Verificar dark mode (mesmo que secundário) — tokens coerentes.
- Confirmar que nenhum teste/handler quebrou: build + typecheck.
- Screenshot antes/depois das vistas principais.

## Detalhes técnicos

- Nenhuma edição em: `src/hooks/*` (exceto se puramente cosmético), `src/integrations/supabase/*`, `supabase/functions/*`, `supabase/migrations/*`, `src/lib/errorMessages.ts`, `useRealtimeSync`.
- Novos componentes de UI vão para `src/components/ui/` (primitivos) e `src/components/layout/` (PageHeader, FilterBar, StatCard).
- Zero classes de cor hardcoded (`text-white`, `bg-black`, `bg-[#...]`) — sempre tokens semânticos.
- Fontes carregadas via `<link>` em `index.html` para evitar FOUT.

## Fora do escopo

- Alterar comportamento de qualquer feature (contagens, RPCs, ERP, realtime).
- Adicionar novas páginas ou remover existentes.
- Alterar rotas, permissões ou schema.
- Mexer em testes de lógica.

Confirma para começar pela **Etapa 1 (design system + fontes)** — depois avanço vista a vista.