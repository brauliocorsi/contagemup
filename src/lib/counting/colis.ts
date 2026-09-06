/**
 * Regra única de composição por colis, partilhada por todo o cliente.
 *
 * Espelha `public.effective_total_colis()` na base de dados: o número de colis
 * de um produto é o maior entre o que está no produto e o que a categoria
 * define. Aqui vive também a regra de quarentena, para que o cálculo de
 * disponibilidade no cliente coincida com o `sync_product_stock` do servidor.
 */

/** Prefixo/rótulo usado nas localizações de quarentena. */
export const QUARANTINE_HINT = 'quarentena';

const norm = (s: string | null | undefined) => (s || '').trim().toLowerCase();

export function isQuarantineLocation(
  location: string | null | undefined,
  quarantineCodes?: string[],
): boolean {
  const l = norm(location);
  if (!l) return false;
  if (quarantineCodes && quarantineCodes.length > 0) {
    return quarantineCodes.some((c) => norm(c) === l);
  }
  return l.includes(QUARANTINE_HINT);
}

export function effectiveTotalColis(
  productTotalColis: number | null | undefined,
  categoryColisNames?: Record<string, string> | null,
): number {
  const fromCategory = categoryColisNames ? Object.keys(categoryColisNames).length : 0;
  return Math.max(1, productTotalColis || 1, fromCategory);
}

export interface ColiTotals {
  /** Quantidade por coli, excluindo quarentena. */
  perColi: Record<number, number>;
  /** Soma de todas as unidades físicas fora de quarentena. */
  physicalUnits: number;
  /** Unidades em quarentena. */
  quarantineUnits: number;
  /** Conjuntos completos = menor coli. */
  completeSets: number;
  /** Unidades acima do mínimo — não formam conjunto. */
  orphanUnits: number;
}

export function computeColiTotals(
  rows: Array<{ colis_number: number; quantity: number; location: string | null }>,
  totalColis: number,
  quarantineCodes?: string[],
): ColiTotals {
  const eff = Math.max(1, totalColis);
  const perColi: Record<number, number> = {};
  for (let i = 1; i <= eff; i++) perColi[i] = 0;

  let physicalUnits = 0;
  let quarantineUnits = 0;

  for (const r of rows) {
    const qty = r.quantity || 0;
    if (isQuarantineLocation(r.location, quarantineCodes)) {
      quarantineUnits += qty;
      continue;
    }
    physicalUnits += qty;
    if (r.colis_number >= 1 && r.colis_number <= eff) {
      perColi[r.colis_number] += qty;
    }
  }

  const quantities = Object.values(perColi);
  const completeSets = eff <= 1 ? physicalUnits : Math.min(...quantities);
  const orphanUnits =
    eff <= 1 ? 0 : Math.max(physicalUnits - Math.max(completeSets, 0) * eff, 0);

  return { perColi, physicalUnits, quarantineUnits, completeSets, orphanUnits };
}
