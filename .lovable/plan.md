
# Permitir Dividir Stock na Mesma Localização com Paletes Diferentes

## Problema Identificado

Existe uma constraint UNIQUE na tabela `counts` que impede ter o mesmo coli numa mesma localização em paletes diferentes:

```sql
CREATE UNIQUE INDEX idx_counts_unique_product_colis_session_location 
ON public.counts USING btree (
  product_id, 
  colis_number, 
  COALESCE(session_id, '00000000-0000-0000-0000-000000000000'::uuid), 
  COALESCE(location, ''::text)  -- ← Não inclui pallet_number!
)
```

### Cenário que Falha

| Palete | Localização | Coli | Resultado |
|--------|-------------|------|-----------|
| Palete 01 | A1 | 1 | OK - Primeiro registo |
| Palete 02 | A1 | 1 | **ERRO** - Viola constraint |

### Porque existe esta constraint?

Foi criada para prevenir duplicação acidental de registos (mesmo produto + coli + session + local). No entanto, o caso de uso de paletes diferentes na mesma localização é legítimo.

---

## Solução

Alterar a constraint para incluir também o `pallet_number`:

```sql
-- Remover constraint antiga
DROP INDEX IF EXISTS idx_counts_unique_product_colis_session_location;

-- Criar nova constraint que inclui pallet_number
CREATE UNIQUE INDEX idx_counts_unique_product_colis_session_location_pallet 
ON public.counts USING btree (
  product_id, 
  colis_number, 
  COALESCE(session_id, '00000000-0000-0000-0000-000000000000'::uuid), 
  COALESCE(location, ''::text),
  COALESCE(pallet_number, ''::text)  -- ← NOVO
);
```

### Nova Tabela de Permissões

| Palete 01 | Palete 02 | Mesma Loc? | Resultado |
|-----------|-----------|------------|-----------|
| A1 | A1 | Sim | **OK** - paletes diferentes |
| A1 (P1) | A1 (P1) | Sim | **ERRO** - duplicado exacto |
| A1 | B2 | Não | OK - localizações diferentes |

---

## Verificação de Dados Existentes

Antes de alterar a constraint, verificar se há registos duplicados que violariam a nova constraint (mesma combinação incluindo pallet).

---

## Alterações

| Tipo | Descrição |
|------|-----------|
| Migration | Alterar constraint unique para incluir `pallet_number` |

---

## Resultado Esperado

1. Permitir dividir stock de um coli na mesma localização mas em paletes diferentes
2. Manter protecção contra duplicação exacta (mesmo produto + coli + session + local + palete)
3. Não afectar funcionalidades existentes
