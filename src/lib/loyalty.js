import { prisma } from '@/lib/prisma'
import { D, lt, lte } from '@/lib/money'

export function freeItemsFromCustomer(customer) {
  if (!customer) return 0
  return Math.max(0, Math.floor(customer.stampsCollected / 9) - customer.stampsRedeemed)
}

export function isProductLoyaltyEligible(productId, products) {
  const p = products.find((prod) => prod.id === productId)
  return Boolean(p?.loyaltyEnabled)
}

export function cartLoyaltyEligibleUnitPrices(cart, products) {
  return cart
    .filter((item) => isProductLoyaltyEligible(item.productId, products))
    .map((item) => item.unitPrice)
}

export function cartStampsEarned(cart, products) {
  return cart.reduce((sum, item) => {
    if (!isProductLoyaltyEligible(item.productId, products)) return sum
    return sum + item.quantity
  }, 0)
}

export function computeLoyaltyFreeDiscount(items, loyaltyByProductId) {
  let minPrice = null
  for (const item of items) {
    if (!loyaltyByProductId[item.productId]) continue
    const price = D(item.unitPrice)
    if (minPrice === null || lt(price, minPrice)) minPrice = price
  }
  return minPrice ?? D(0)
}

export async function resolveOnlineLoyaltyRedemption({ customer, items, redeemRequested }) {
  if (!redeemRequested) {
    return { discountAmount: 0, freeItemRedeemed: false }
  }

  if (freeItemsFromCustomer(customer) <= 0) {
    return { error: 'No free coffee available' }
  }

  const productIds = [...new Set(items.map((i) => i.productId))]
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, loyaltyEnabled: true },
  })
  const loyaltyByProductId = Object.fromEntries(
    products.map((p) => [p.id, p.loyaltyEnabled])
  )

  const discountAmount = computeLoyaltyFreeDiscount(items, loyaltyByProductId)
  if (lte(discountAmount, 0)) {
    return { error: 'No loyalty-eligible items in cart' }
  }

  return { discountAmount, freeItemRedeemed: true }
}
