import type { Count, ColisDetail, Product, ProductWithCounts } from '@/types/stock';

/**
 * Pure computation: given a product, its counts, and (optional) category coli
 * names, return the ProductWithCounts derived view.
 *
 * No side effects, no react-query, safe to unit-test.
 */
export function getProductWithCounts(
  product: Product,
  counts: Count[],
  categoryColisNames?: Record<string, string> | null,
): ProductWithCounts {
  const productCounts = counts.filter((c) => c.product_id === product.id);

  const categoryColisCount = categoryColisNames ? Object.keys(categoryColisNames).length : 0;
  const effectiveTotalColis = Math.max(product.total_colis, categoryColisCount);

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
    colisQuantities[i] = totalQuantity;

    const primaryEntry = locationEntries.find((e) => e.quantity > 0) || locationEntries[0];

    colisDetails.push({
      colis_number: i,
      quantity: totalQuantity,
      location: primaryEntry?.location || null,
      locationEntries,
      hasMultipleLocations: locationEntries.filter((e) => e.quantity > 0).length > 1,
    });
  }

  const allLocations = colisDetails.flatMap((c) =>
    c.locationEntries.map((e) => e.location).filter((loc): loc is string => loc !== null && loc.trim() !== ''),
  );
  const uniqueLocations = [...new Set(allLocations)].sort();

  const hasMultipleLocations = uniqueLocations.length > 1 || colisDetails.some((c) => c.hasMultipleLocations);

  const location = uniqueLocations[0] || product.location || null;

  const quantities = Object.values(colisQuantities);
  const completeSets = quantities.length > 0 ? Math.min(...quantities) : 0;
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
  };
}
