
## Problema

O projeto usa `vite-plugin-pwa` com `registerType: "autoUpdate"` e um service worker que faz cache de `**/*.{js,css,html,ico,png,svg}`. Assim que o utilizador abriu a app uma vez, o SW serve os assets antigos do cache até que:
1. Todas as abas da app sejam fechadas, ou
2. O novo SW consiga tomar controlo (o `autoUpdate` só ativa após reload completo sem abas abertas).

Por isso, mesmo com F5, a UI antiga continua a aparecer — é o service worker, não o servidor.

Além disso, o `index.html` ainda tem as fontes antigas (`Space Grotesk` + `DM Sans`) em vez de `Urbanist` + `Epilogue` do redesign Ocean Deep, o que também contribui para a sensação de "não mudou nada".

## Correção proposta

### 1. Forçar o service worker a assumir controlo imediato
Em `vite.config.ts`, no bloco `VitePWA`:
- Adicionar `workbox.skipWaiting: true` e `workbox.clientsClaim: true` para que a nova versão substitua a antiga sem esperar o fecho das abas.
- Adicionar `workbox.cleanupOutdatedCaches: true` para eliminar caches de builds anteriores.

### 2. Registar handler de update no cliente
Criar `src/lib/pwa-update.ts` que usa `registerSW` do `virtual:pwa-register` para:
- Detetar quando um novo SW está disponível.
- Fazer `window.location.reload()` automático (ou mostrar um toast "Nova versão disponível — a atualizar…" com auto-reload após 1s).

Importar esse ficheiro uma vez em `src/main.tsx`.

### 3. Alinhar as fontes do `index.html` com o novo design system
Substituir o `<link>` do Google Fonts em `index.html`:
- Remover `Space Grotesk` + `DM Sans`.
- Carregar `Urbanist` (400,500,600,700) + `Epilogue` (400,500,600,700), que é o que o `tailwind.config.ts` e o `index.css` já esperam.

### 4. Instruções ao utilizador (uma única vez)
Após esta build ser publicada, o utilizador precisa de:
- Fechar **todas** as abas da app aberta e reabrir, **ou**
- Fazer hard-reload (Ctrl+Shift+R / Cmd+Shift+R) uma vez.

A partir daí, o `skipWaiting + clientsClaim` garante que todas as futuras atualizações são aplicadas automaticamente no próximo reload normal.

## Detalhes técnicos

- `vite-plugin-pwa` já está instalado — não é preciso adicionar dependências.
- O import `virtual:pwa-register` é fornecido pelo próprio plugin (types já vêm com `vite-plugin-pwa/client`).
- Nenhuma lógica de negócio é tocada; só shell/PWA.

## Fora do âmbito

- Não vou desativar o PWA nem remover o service worker.
- Não vou tocar em hooks, RPCs ou views funcionais.
