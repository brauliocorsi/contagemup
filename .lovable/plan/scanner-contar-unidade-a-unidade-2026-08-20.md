# Scanner: contar unidade a unidade

## Problema encontrado

No componente de leitura (`ScanInput`) existe um filtro anti-repetição: se o mesmo código for lido outra vez dentro de 1,2 segundos, a leitura é **ignorada em silêncio**. Esse filtro existe por causa da câmara (que dispara o mesmo código muitas vezes por segundo), mas apanha também as leituras reais feitas com pistola/teclado.

Resultado: o produto é identificado na primeira leitura, mas as leituras seguintes do mesmo código não somam nada — nem no módulo de Entradas (que já faz +1 por leitura) nem no Picking (que faz +1 por linha).

## O que vai mudar

1. **Contagem repetida passa a funcionar**
   - Leituras por pistola/teclado (Enter) deixam de ser filtradas: cada passagem conta sempre +1.
   - A câmara mantém proteção contra leituras duplicadas, mas com uma janela curta e ajustável (por defeito ~800 ms), para permitir passar a mesma etiqueta várias vezes de propósito.
   - Cada leitura dá retorno imediato: som curto, vibração no telemóvel e aviso com o total acumulado do produto (ex.: "Coca-Cola 1,5L — 7 un.").

2. **Incremento manual em todos os módulos de contagem**
   - Entradas: botões −/+ e campo de quantidade por coli em cada linha (hoje só existe o campo numérico), e um multiplicador "cada leitura conta N unidades" no topo.
   - Picking: já tem −/+; passa a ter também campo direto para escrever a quantidade conferida.

3. **Consulta e Transferência**
   - Consulta: ao ler o mesmo produto repetidamente passa a mostrar um contador de leituras da sessão (útil para contagem rápida), sem alterar stock.
   - Transferência: ler o mesmo produto/coli repetidamente incrementa a quantidade selecionada em vez de reiniciar a seleção.

4. **Comandos de quantidade**
   - Os códigos `CMD-QTY+`, `CMD-QTY-` e `CMD-QTY-<n>` passam a aplicar-se à última linha lida nos módulos de Entradas e Picking (hoje só mostram um aviso).

## Detalhes técnicos

- `src/components/scanner/ScanInput.tsx`: novas props `dedupeMs` (default 800) e `allowRepeat`; o filtro só se aplica às leituras da câmara. Adicionar feedback áudio (WebAudio, beep curto) + `navigator.vibrate`. Manter o campo focado após cada Enter.
- `src/components/scanner/EntryModule.tsx`: guardar `lastKey` da linha lida; botões −/+ por coli; estado `step` (multiplicador); toast com total acumulado.
- `src/components/scanner/PickingModule.tsx`: aplicar `step` no `bump`, input direto de quantidade, tratar comandos QTY sobre a última linha conferida.
- `src/components/scanner/TransferModule.tsx`: quando o produto lido já está em foco, incrementar `selected[row]` do coli correspondente em vez de limpar.
- `src/components/scanner/ProductInquiryModule.tsx`: contador de leituras por produto na sessão.
- `src/pages/ScannerApp.tsx`: encaminhar comandos QTY para o módulo ativo (callback partilhado).

Nenhuma alteração de base de dados ou de lógica de stock: as gravações continuam a usar `register_entry` e `commit_exit_cart` como hoje.
