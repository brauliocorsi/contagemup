# Fluxo de Expedição: Cais, Transporte e Entrega

Hoje o picking do scanner dá **saída imediata** do stock (`commit_exit_cart`). Passa a ser um fluxo em 4 etapas onde o stock só sai do sistema quando a entrega ao cliente é confirmada.

## Tipos de localização

Cada localização passa a ter um **tipo**:

- **Stock** — ruas/racks atuais (comportamento inalterado)
- **Pré-saída** — cais de carga
- **Transporte** — Carrinha X, Y, Z (uma localização por viatura)
- **Quarentena** — devoluções

As zonas livres já existentes (`is_staging`) passam a ser tipo "Pré-saída" automaticamente. A configuração de tipo fica no ecrã Armazém > Configurar > Localizações.

## Fluxo completo

```text
Ruas/Racks  --picking-->  Cais de Carga  --carregamento-->  Carrinha X  --entrega-->  Saída
   (stock)                (reservado à nota)                (reservado)              (stock_movements)
```

1. **Picking (scanner)** — ao concluir, o stock é *transferido* das localizações de stock para o cais escolhido e fica **reservado à nota de encomenda** de cada artigo. Não há saída nem movimento de saída.
2. **Conferência de carregamento** — novo módulo no scanner: escolher a carrinha, ler artigo a artigo (validando contra a nota) ou confirmar a nota inteira de uma vez. O stock passa do cais para a localização da carrinha.
3. **Entregas (ADM)** — novo ecrã no dashboard com as notas em transporte por viatura. Ao marcar uma nota como entregue, aí sim é feita a saída definitiva do stock (movimento de saída com a referência da nota). Também permite marcar "devolvido" → o stock vai para Quarentena.
4. **Rastreio** — cada nota mostra o estado: Em picking → No cais → Em transporte → Entregue / Devolvido.

## Número da nota

O número da encomenda deixa de ser só texto informativo: passa a ser a chave da reserva. Cada unidade movida guarda a nota a que pertence, o que permite carregar/entregar por nota e detetar artigos carregados na viatura errada.

## Detalhes técnicos

**Base de dados**

- `warehouse_locations`: nova coluna `location_type` (`stock` | `pre_exit` | `transport` | `quarantine`), default `stock`; migração define `pre_exit` onde `is_staging = true`. `is_staging` mantém-se para compatibilidade.
- Nova tabela `delivery_notes`: `order_number` (único por picking), `task_id`, `client_name`, `status` (`picking`|`staged`|`loaded`|`delivered`|`returned`), `vehicle_location`, `delivered_at`, `delivered_by`, timestamps. Com GRANTs (`authenticated`, `service_role`), RLS ativo, leitura/escrita a autenticados e eliminação só a admin.
- Nova tabela `delivery_note_items`: `note_id`, `product_id`, `product_code`, `product_name`, `quantity`, `staged_quantity`, `loaded_quantity`, `delivered_quantity`, `location` atual. Mesmos GRANTs/RLS.
- RPC `stage_picking_to_dock(p_task_id, p_dock_location, p_lines jsonb)` — transfere `counts` das localizações de origem para o cais e cria/atualiza `delivery_notes` + itens (`staged`). Transacional, security definer.
- RPC `load_notes_to_vehicle(p_note_ids uuid[], p_vehicle_location, p_items jsonb)` — move do cais para a carrinha, marca `loaded`.
- RPC `deliver_note(p_note_id)` — chama a lógica de saída existente (`commit_exit_cart` interna) com `reference = order_number`, zera os `counts` da localização da viatura e marca `delivered`.
- RPC `return_note_items(p_note_id, p_items)` — move para a localização de quarentena e marca `returned`.

**Frontend**

- `LocationsConfig.tsx`: seletor de tipo de localização em vez do toggle "zona livre".
- `PickingModule.tsx`: `finalize()` deixa de chamar `commit_exit_cart`; passa a pedir o cais de destino e chamar `stage_picking_to_dock`. Mensagens e talão atualizados ("Enviado para o cais").
- Novo `src/components/scanner/LoadingModule.tsx`: seleção de carrinha, lista de notas no cais, leitura artigo a artigo + botão "Confirmar nota completa". Adicionado à navegação do scanner.
- Novo `src/components/logistics/DeliveriesView.tsx` (menu Logística > Entregas): notas por estado/viatura, detalhe de artigos, ações Entregue / Devolvido (admin), com histórico de datas e responsáveis.
- Novo hook `src/hooks/useDeliveryNotes.tsx` com as queries/mutations e invalidação de `products`/`counts`.
- `UnlocatedStockPanel` e mapa do armazém passam a distinguir os novos tipos por cor/badge.

Nada do stock, contagens, transferências ou entradas atuais muda de comportamento.
