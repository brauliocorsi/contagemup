
# PWA - Aplicativo Instalavel (Mobile e Windows)

Vou transformar a aplicacao num Progressive Web App (PWA) que podera ser instalado directamente do navegador em qualquer dispositivo: telemovel (Android/iPhone) e computador (Windows/Mac/Linux).

## O que vai mudar para o utilizador

- Um botao "Instalar App" aparecera na pagina principal
- No telemovel ou PC, o navegador ira sugerir a instalacao
- A app ficara com icone no ecra inicial / desktop, como uma app nativa
- Funcionara offline para navegacao basica

## Passos tecnicos

### 1. Instalar plugin PWA
- Adicionar o pacote `vite-plugin-pwa` ao projecto

### 2. Configurar vite.config.ts
- Adicionar o plugin `VitePWA` com:
  - Manifest (nome: "UP Moveis - Contagem", cores, icones)
  - Service worker com `navigateFallbackDenylist: [/^\/~oauth/]` para nao interferir com autenticacao
  - Estrategia de cache para funcionamento offline

### 3. Criar icones PWA
- Gerar icones em `public/` nos tamanhos 192x192 e 512x512 (usando o logo existente da UP Moveis)

### 4. Actualizar index.html
- Adicionar meta tags para mobile:
  - `theme-color`
  - `apple-mobile-web-app-capable`
  - `apple-mobile-web-app-status-bar-style`

### 5. Criar pagina /install
- Pagina dedicada com instrucoes de instalacao
- Botao que acciona o prompt de instalacao nativo do navegador (evento `beforeinstallprompt`)
- Instrucoes visuais para iOS (que nao suporta o prompt automatico)

### 6. Adicionar botao "Instalar" no Header
- Botao visivel no cabecalho que leva a pagina de instalacao ou acciona o prompt directamente

## Resultado final
- A app podera ser instalada em Windows, Android e iOS
- Tera icone proprio e abrira em janela dedicada (sem barra do navegador)
- Suportara uso offline basico
