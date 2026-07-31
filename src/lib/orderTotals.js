import { D, sum } from '@/lib/money'

// All return decimal.js Decimal values. Inputs may be Decimal (DB rows),
// numbers (client cart), or numeric strings (serialized API data) — D() coerces.

export function modsTotalForItem(item) {
  return sum(item.modifiers, (m) => m.price)
}

export function lineTotalForItem(item) {
  const adj = D(item.priceAdjustment ?? 0)
  return D(item.unitPrice).plus(modsTotalForItem(item)).plus(adj).times(item.quantity)
}

export function itemsSubtotal(items, { includeAdjustments = true } = {}) {
  return (items ?? []).reduce((acc, item) => {
    const modsTotal = sum(item.modifiers, (m) => m.price).times(item.quantity)
    const adj = includeAdjustments ? D(item.priceAdjustment ?? 0).times(item.quantity) : D(0)
    return acc.plus(D(item.unitPrice).times(item.quantity)).plus(modsTotal).plus(adj)
  }, D(0))
}
