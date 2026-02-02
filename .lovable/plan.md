

# Correcção: Utilizadores Diferentes Veem Stock Diferente

## Problema Identificado

Quando um utilizador faz logout e outro faz login, o sistema mostra dados antigos porque:

1. **Cache do React Query não é limpo** - O `QueryClient` mantém os dados em cache por 2 minutos (`staleTime: 2 * 60 * 1000`)
2. **localStorage não é limpo** - A sessão de contagem seleccionada (`counting_selected_session`) persiste entre utilizadores
3. **Não há detecção de mudança de utilizador** - O sistema não detecta quando o user_id muda para invalidar o cache

```text
┌─────────────────────────────────────────────────────────────────┐
│  PROBLEMA                                                        │
├─────────────────────────────────────────────────────────────────┤
│  1. Utilizador A faz login                                      │
│     └─ React Query carrega dados: products, counts, sessions    │
│                                                                 │
│  2. Utilizador A faz logout                                     │
│     └─ signOut() limpa apenas: user, session, profile           │
│     └─ NÃO limpa: QueryClient cache, localStorage               │
│                                                                 │
│  3. Utilizador B faz login                                      │
│     └─ React Query mostra dados EM CACHE (2min stale)           │
│     └─ Dados antigos do Utilizador A são mostrados! ❌          │
└─────────────────────────────────────────────────────────────────┘
```

## Solução

Implementar limpeza completa de cache e localStorage quando o utilizador muda (login/logout).

### Passo 1: Modificar useAuth.tsx

Adicionar acesso ao QueryClient para limpar o cache no signOut:

```typescript
// src/hooks/useAuth.tsx
import { useQueryClient } from '@tanstack/react-query';

const signOut = async () => {
  // Limpar cache do React Query
  queryClient.clear();
  
  // Limpar localStorage específico do utilizador
  localStorage.removeItem('counting_selected_session');
  
  // Fazer logout
  await supabase.auth.signOut();
  setUser(null);
  setSession(null);
  setProfile(null);
};
```

### Passo 2: Detectar mudança de utilizador no login

Criar um hook ou effect que detecte quando o `user.id` muda e limpe o cache:

```typescript
// Em useAuth.tsx ou criar novo hook useUserChange.tsx
const prevUserId = useRef<string | null>(null);

useEffect(() => {
  if (user?.id !== prevUserId.current) {
    // User mudou - limpar cache
    queryClient.clear();
    
    // Limpar localStorage do utilizador anterior
    if (prevUserId.current !== null) {
      localStorage.removeItem('counting_selected_session');
    }
    
    prevUserId.current = user?.id ?? null;
  }
}, [user?.id, queryClient]);
```

### Passo 3: Mover QueryClient para dentro do React Tree

Para que o `useQueryClient()` funcione no `useAuth`, precisamos de reestruturar a hierarquia de componentes:

**Antes:**
```
App.tsx
└─ QueryClientProvider
   └─ Index.tsx
      └─ AuthProvider (não tem acesso ao queryClient)
```

**Depois:**
```
App.tsx
└─ QueryClientProvider
   └─ AuthProviderWithQuery (tem acesso ao queryClient)
      └─ AppContent
```

## Ficheiros a Modificar

| Ficheiro | Alteração |
|----------|-----------|
| `src/hooks/useAuth.tsx` | Adicionar limpeza de cache e localStorage no signOut |
| `src/pages/Index.tsx` | Passar queryClient para AuthProvider ou reestruturar |
| `src/App.tsx` | Possivelmente mover AuthProvider para dentro do QueryClientProvider |

## Resultado Esperado

Após a correcção:
- Quando um utilizador faz logout, todo o cache é limpo
- Quando um novo utilizador faz login, dados frescos são carregados
- Não há mais confusão de dados entre utilizadores diferentes
- A experiência é consistente independentemente de quem estava logado antes

