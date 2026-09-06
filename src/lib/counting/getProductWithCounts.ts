import type { Count, ColisDetail, Product, ProductWithCounts } from '@/types/stock';
import { computeColiTotals, effectiveTotalColis as effColis, isQuarantineLocation } from './colis';

/**
 * Pure computation: given a product, its counts, and (optional) category coli
 * names, return the ProductWithCounts derived view.
 *
 * As unidades em quarentena são mostradas no detalhe por coli mas NÃO entram
 * no cálculo de conjuntos completos — igual ao `sync_product_stock` na base de dados.
 *
 * No side effects, no react-query, safe to unit-test.
 */
export function getProductWithCounts(
  product: Product,
  counts: Count[],
  categoryColisNames?: Record<string, string> | null,
  quarantineCodes?: string[],
): ProductWithCounts {
  const productCounts = counts.filter((c) => c.product_id === product.id);

  const effectiveTotalColis = effColis(product.total_colis, categoryColisNames);

  const totals = computeColiTotals(
    productCounts.map((c) => ({
      colis_number: c.colis_number,
      quantity: c.quantity,
      location: c.location,
    })),
    effectiveTotalColis,
    quarantineCodes,
  );

  const colisDetails: ColisDetail[] = [];
  const colisQuantities: Record<number, number> = {};

  for (let i = 1; i <= effectiveTotalColis; i++) {
    const countsForColi = productCounts.filter((c) => c.colis_number === i);

    const locationEntries = countsForColi.map((count) => ({
      countId: count.id,
      quantity: count.quantity,
      location: count.location,
    }));

    const totalQuantity = locationEntries.reduce((sum, e) => sum + e.quantity, 0);
    colisQuantities[i] = totals.perColi[i] ?? 0;

    const primaryEntry =
      locationEntries.find((e) => e.quantity > 0 && !isQuarantineLocation(e.location, quarantineCodes)) ||
      locationEntries.find((e) => e.quantity > 0) ||
      locationEntries[0];

    colisDetails.push({
      colis_number: i,
      quantity: totalQuantity,
      location: primaryEntry?.location || null,
      locationEntries,
      hasMultipleLocations: locationEntries.filter((e) => e.quantity > 0).length > 1,
    });
  }


  // Only locations that actually hold stock (quantity > 0) count as "onde está o produto".
  // Zero-quantity rows are leftovers of transfers and must not appear in the badge.
  const allLocations = colisDetails.flatMap((c) =>
    c.locationEntries
      .filter((e) => e.quantity > 0)
      .map((e) => e.location)
      .filter((loc): loc is string => loc !== null && loc.trim() !== ''),
  );
  const uniqueLocations = [...new Set(allLocations)].sort();


  const hasMultipleLocations = uniqueLocations.length > 1 || colisDetails.some((c) => c.hasMultipleLocations);

  const location = uniqueLocations[0] || product.location || null;

  const quantities = Object.values(colisQuantities);
  const completeSets = totals.completeSets;
  const maxQuantity = quantities.length > 0 ? Math.max(...quantities) : 0;


  const incompleteColis: { colis_number: number; quantity: number }[] = [];
  const excessColis: { colis_number: number; excess: number }[] = [];
  const missingForNextComplete: { colis_number: number; missing: number }[] = [];

  const hasPartialProduct = maxQuantity > completeSets;

  for (let i = 1; i <= effectiveTotalColis; i++) {
    const qty = colisQuantities[i];
    if (qty < maxQuantity) {
      incompleteColis.push({ colis_number: i, quantity: qty });
      missingForNextComplete.push({ colis_number: i, missing: maxQuantity - qty });
    }
    if (qty > completeSets && qty === maxQuantity) {
      excessColis.push({ colis_number: i, excess: qty - completeSets });
    }
  }

  let status: ProductWithCounts['status'] = 'not_counted';
  const totalCounted = quantities.reduce((sum, q) => sum + q, 0);
  if (totalCounted === 0) status = 'not_counted';
  else if (hasPartialProduct) status = 'incomplete';
  else if (completeSets > 0) status = 'complete';

  const totalExcessParts = maxQuantity - completeSets;

  return {
    ...product,
    counts: productCounts,
    completeSets,
    incompleteColis,
    excessColis,
    missingForNextComplete,
    hasPartialProduct,
    totalExcessParts,
    location,
    status,
    colisDetails,
    uniqueLocations,
    hasMultipleLocations,
    physicalUnits: totals.physicalUnits,
    quarantineUnits: totals.quarantineUnits,
    orphanUnits: totals.orphanUnits,
  };
}

