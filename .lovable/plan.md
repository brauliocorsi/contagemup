

# Correcção: Localização Editável + Corrigir Divisão de Colis

## Problemas Identificados

### Problema 1: Localização não editável manualmente

O utilizador quer poder:
- Seleccionar o **palete** → sistema preenche **localização** automaticamente
- Mas depois poder **editar a localização manualmente** se necessário

### Problema 2: Erro ao dividir coli em múltiplas localizações

Existe um índice único na base de dados que impede criar múltiplos registos para o mesmo coli:

```text
CREATE UNIQUE INDEX idx_counts_unique_product_colis_session 
ON public.counts USING btree (
  product_id, 
  colis_number, 
  COALESCE(session_id, '00000000-0000-0000-0000-000000000000'::uuid)
)
```

Este índice impede a funcionalidade de dividir um coli em 2+ localizações, porque cada divisão tenta inserir múltiplos registos com o mesmo `(product_id, colis_number, session_id)`.

---

## Solução

### Parte 1: Restaurar LocationSelect Editável + Auto-preenchimento

**Comportamento desejado:**
```text
┌──────────────────────────────────────────────────────────────┐
│  Coli 2/2                                                    │
├──────────────────────────────────────────────────────────────┤
│  Palete: [ PLT052 ▼]  ← Utilizador selecciona               │
│                                                              │
│  Localização: [ B3  ▼]  ← Auto-preenchida pelo palete       │
│                           mas EDITÁVEL se necessário         │
└──────────────────────────────────────────────────────────────┘
```

**Ficheiros a modificar:**
- `src/components/counting/ProductCard.tsx` - Restaurar `LocationSelect` como editável
- `src/components/counting/SplitStockDialog.tsx` - Restaurar `LocationSelect` com auto-preenchimento

**Lógica:**
1. Quando o utilizador selecciona um palete, preencher automaticamente a localização desse palete
2. A localização continua editável - o utilizador pode trocar depois
3. Se o utilizador trocar a localização sem trocar o palete, manter o valor manual

### Parte 2: Corrigir Índice da Base de Dados

**Alteração necessária:**
Adicionar `location` ao índice único para permitir múltiplos registos do mesmo coli em localizações diferentes:

```sql
-- Remover índice actual
DROP INDEX IF EXISTS idx_counts_unique_product_colis_session;

-- Criar novo índice que inclui localização
CREATE UNIQUE INDEX idx_counts_unique_product_colis_session_location 
ON public.counts USING btree (
  product_id, 
  colis_number, 
  COALESCE(session_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(location, '')
);
```

Isto permite:
- Coli 2 + Sessão A + Localização B3 → ✓ 1 registo
- Coli 2 + Sessão A + Localização C12 → ✓ 1 registo (diferente)
- Coli 2 + Sessão A + Localização B3 → ✗ duplicado (mesmo que antes)

---

## Detalhes Técnicos

### Modificação 1: ProductCard.tsx

Restaurar `LocationSelect` editável ao lado do `PalletSelect`:

```tsx
{/* Palete - quando seleccionado, preenche localização */}
<PalletSelect
  value={colisPallets[colisNum] ?? colisPallet ?? ''}
  onValueChange={(newPal, derivedLocation) => {
    setColisPallets(prev => ({ ...prev, [colisNum]: newPal }));
    // Auto-preencher localização do palete
    if (derivedLocation) {
      setColisLocations(prev => ({ ...prev, [colisNum]: derivedLocation }));
      onColisLocationChange?.(product.id, colisNum, derivedLocation);
    }
    onColisPalletChange?.(product.id, colisNum, newPal);
  }}
/>

{/* Localização - editável manualmente */}
<LocationSelect
  value={colisLocations[colisNum] ?? colisLocation ?? ''}
  onValueChange={(newLoc) => {
    setColisLocations(prev => ({ ...prev, [colisNum]: newLoc }));
    onColisLocationChange?.(product.id, colisNum, newLoc);
  }}
/>
```

### Modificação 2: SplitStockDialog.tsx

Aplicar mesma lógica - quando selecciona palete, preenche localização:

```tsx
<PalletSelect
  value={dist.pallet_number}
  onValueChange={(value, derivedLocation) => {
    // Actualizar palete
    updateDistribution(dist.id, 'pallet_number', value);
    // Auto-preencher localização do palete (se disponível)
    if (derivedLocation) {
      updateDistribution(dist.id, 'location', derivedLocation);
    }
  }}
/>

<LocationSelect
  value={dist.location}
  onValueChange={(value) => updateDistribution(dist.id, 'location', value)}
/>
```

### Modificação 3: Base de Dados

Migração SQL para alterar o índice:

```sql
-- Permitir múltiplos registos do mesmo coli em localizações diferentes
DROP INDEX IF EXISTS idx_counts_unique_product_colis_session;

CREATE UNIQUE INDEX idx_counts_unique_product_colis_session_location 
ON public.counts USING btree (
  product_id, 
  colis_number, 
  COALESCE(session_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(location, '')
);
```

---

## Ficheiros a Modificar

| Ficheiro | Alteração |
|----------|-----------|
| `src/components/counting/ProductCard.tsx` | Restaurar `LocationSelect` editável, manter auto-preenchimento do palete |
| `src/components/counting/SplitStockDialog.tsx` | Adicionar auto-preenchimento da localização quando selecciona palete |
| Base de dados (migração) | Alterar índice único para incluir localização |

---

## Resultado Esperado

1. **Localização editável**: Utilizador pode sempre alterar a localização manualmente
2. **Auto-preenchimento inteligente**: Ao seleccionar palete, localização é preenchida automaticamente
3. **Divisão funciona**: Um coli pode ser dividido em 2+ localizações diferentes
4. **Sets completos mantidos**: O trigger de stock calcula `MIN(colis)` correctamente mesmo com divisões
5. **Consistência de dados**: Índice único previne duplicados exactos (mesmo coli + mesma localização + mesma sessão)

