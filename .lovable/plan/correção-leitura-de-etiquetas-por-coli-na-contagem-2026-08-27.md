# Correção: leitura de etiquetas por coli na Contagem

## Problema

Ao ler a etiqueta `CODIGO-C2` no módulo Contagem do scanner, o incremento vai sempre para o coli 1.

Causa confirmada no código: `parseScan()` (`src/lib/scanner/commands.ts`) já separa o código base do número de coli e devolve `value = "CODIGO"` (sem o sufixo) e `colis = 2`. O `CountingModule` (`src/components/scanner/CountingModule.tsx`) ignora `parsed.colis` e volta a tentar extrair o sufixo `-c(\d+)` a partir de `parsed.value` — que já não o tem. Resultado: `coli = null` e a linha escolhida é sempre `candidates[0]`, ou seja, o primeiro coli da localização.

Os itens da conferência são criados por coli (`colis_number` vindo de `counts`), portanto a linha correta existe — apenas não é selecionada.

## Alteração

Em `src/components/scanner/CountingModule.tsx`, no `handleScan`:

- Usar `parsed.colis` como número de coli lido (mantendo o fallback de extrair `-C<n>` caso o código venha inteiro).
- Procurar o item por código base + `colis_number` igual ao lido.
- Se for lido um coli que não existe naquela localização, mostrar mensagem clara (ex.: "Coli 2 de CODIGO não está em B33") em vez de incrementar o coli errado.
- Sem coli na etiqueta (produto de 1 coli), o comportamento atual mantém-se.

Nenhuma alteração de base de dados nem de outros módulos: Consulta, Transferência, Entradas e Arrumação já usam `parsed.colis` corretamente; o Picking é por produto, não por coli, e fica como está.
