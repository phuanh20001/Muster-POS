// Single source of truth for which add-ons a product offers.
// Rule: a product's own modifiers OVERRIDE its category's — if a product has any
// ProductModifier, the inherited CategoryModifier list is suppressed for it, so the
// UI and the server validator always agree on the same pool.

export function productModifiers(product) {
  return (product?.modifiers ?? []).map((m) => ({ ...m, source: 'product' }))
}

export function categoryModifiers(product) {
  return (product?.category?.modifiers ?? []).map((m) => ({ ...m, source: 'category' }))
}

export function effectiveModifiers(product) {
  const own = productModifiers(product)
  return own.length > 0 ? own : categoryModifiers(product)
}
