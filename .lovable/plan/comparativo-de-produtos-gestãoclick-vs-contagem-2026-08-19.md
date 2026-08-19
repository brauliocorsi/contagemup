# Comparativo de Produtos: GestãoClick vs Contagem

Gerar um ficheiro Excel único (entregue para download) comparando os cadastros das duas plataformas.

## Dados

- Contagem: tabela de produtos do sistema (1.683 registos), com código, nome, stock atual, localização e palete.
- GestãoClick: os produtos em cache estão desatualizados (última atualização em março), por isso os dados serão puxados frescos da API do ERP (todas as páginas, produtos ativos).

## Abas do Excel

1. **Resumo** — contagens totais de cada lado, quantos códigos coincidem, quantos só existem num lado, quantos casos de nome igual com código diferente.
2. **Códigos iguais** — produtos presentes nas duas plataformas pelo mesmo código: código, nome no Contagem, nome no ERP, indicação se os nomes divergem, stock local e stock ERP.
3. **Só no Contagem** — códigos que não existem no GestãoClick.
4. **Só no GestãoClick** — códigos que não existem no Contagem.
5. **Nome igual, código diferente** — pares com nome normalizado idêntico (sem maiúsculas/acentos/espaços extra/pontuação) mas códigos distintos, mostrando os dois códigos, nome original de cada lado e os stocks.

## Formato

- Cabeçalhos a negrito, colunas ajustadas, filtros automáticos e painéis fixos.
- Fonte Arial, números sem casas decimais desnecessárias, zeros como "-".
- Ficheiro entregue em `/mnt/documents/` para download imediato.

## Notas técnicas

- Sem alterações ao código da aplicação; é um artefacto pontual.
- Normalização de nomes: minúsculas, remoção de acentos, colapso de espaços, remoção de pontuação.
- Código do ERP usado: `codigo_interno` com fallback para `codigo`.
