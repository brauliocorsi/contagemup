# Código de Fornecedor nos Produtos

Adicionar um código do fornecedor (o código de barras do fornecedor) a cada produto, com uma página rápida de atribuição por leitura de código de barras.

## O que muda

### 1. Novo campo no produto
- Novo campo `Código do Fornecedor` na tabela de produtos (texto, opcional, único quando preenchido).
- Editável no formulário de edição do produto e visível na ficha/lista de produtos.
- Filtro na lista de produtos: "Sem código de fornecedor" para saber o que falta preencher.

### 2. Nova página "Códigos de Fornecedor" (atribuição rápida)
Fluxo pensado para inventário, com o campo de leitura sempre focado:

1. Ler ou pesquisar o produto (código interno, nome ou código já existente) — mostra nome, código interno, stock e código de fornecedor atual.
2. Ler o código de barras do fornecedor — grava imediatamente no produto e passa ao produto seguinte.
3. Botão "Igual ao código interno" para os casos em que o fornecedor usa o mesmo código (1 clique).
4. Se o código lido já pertencer a outro produto, aviso claro com opção de substituir.
5. Lista das últimas atribuições da sessão, com opção de desfazer.
6. Contador de progresso: quantos produtos ainda estão sem código de fornecedor.

Acessível a partir do menu do Scanner (`/scanner`) e também via link no menu principal.

### 3. Leitura por código de fornecedor em todo o sistema
O scanner (Consulta, Entradas, Picking, Transferências) passa a encontrar o produto também pelo código de fornecedor, além do código interno e dos aliases já existentes.

## Detalhes técnicos

- Migração: `ALTER TABLE public.products ADD COLUMN supplier_code text;` + índice único parcial (`WHERE supplier_code IS NOT NULL`).
- `useProductResolver` (`src/hooks/useScannerData.tsx`): acrescentar consulta por `supplier_code` na cadeia de resolução, antes da procura por nome.
- Novo componente `src/components/scanner/SupplierCodeModule.tsx` usando `ScanInput` (foco persistente já implementado) e uma mutação de update em `products`.
- Registar a operação em `ScannerApp.tsx` (grelha inicial + navegação inferior).
- `ProductEditForm.tsx` e `ProductsView.tsx`: campo + coluna + filtro; `types/stock.ts` atualizado.
- Alterações ao campo ficam registadas em `product_changes` pelo caminho normal de `updateProduct`.

Nada nas entradas, saídas ou contagens é alterado.
