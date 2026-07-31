import test from 'node:test'
import assert from 'node:assert/strict'
import {
  freeItemsFromCustomer,
  isProductLoyaltyEligible,
  cartStampsEarned,
  computeLoyaltyFreeDiscount,
} from '@/lib/loyalty'
import { eq } from '@/lib/money'

test('freeItemsFromCustomer: 9 stamps = 1 free, redemptions subtract, never negative', () => {
  assert.equal(freeItemsFromCustomer(null), 0)
  assert.equal(freeItemsFromCustomer({ stampsCollected: 8, stampsRedeemed: 0 }), 0)
  assert.equal(freeItemsFromCustomer({ stampsCollected: 9, stampsRedeemed: 0 }), 1)
  assert.equal(freeItemsFromCustomer({ stampsCollected: 27, stampsRedeemed: 1 }), 2)
  assert.equal(freeItemsFromCustomer({ stampsCollected: 9, stampsRedeemed: 5 }), 0) // clamped at 0
})

const products = [
  { id: 1, loyaltyEnabled: true },
  { id: 2, loyaltyEnabled: false },
  { id: 3, loyaltyEnabled: true },
]

test('isProductLoyaltyEligible reflects the product flag', () => {
  assert.equal(isProductLoyaltyEligible(1, products), true)
  assert.equal(isProductLoyaltyEligible(2, products), false)
  assert.equal(isProductLoyaltyEligible(999, products), false) // unknown product
})

test('cartStampsEarned counts only eligible items, by quantity', () => {
  const cart = [
    { productId: 1, quantity: 2 }, // eligible
    { productId: 2, quantity: 5 }, // not eligible
    { productId: 3, quantity: 1 }, // eligible
  ]
  assert.equal(cartStampsEarned(cart, products), 3)
})

test('computeLoyaltyFreeDiscount picks the cheapest eligible unit price', () => {
  const items = [
    { productId: 1, unitPrice: '5.50' }, // eligible
    { productId: 2, unitPrice: '2.00' }, // NOT eligible - must be ignored even though cheaper
    { productId: 3, unitPrice: '4.25' }, // eligible - cheapest eligible
  ]
  const loyaltyByProductId = { 1: true, 3: true }
  assert.ok(eq(computeLoyaltyFreeDiscount(items, loyaltyByProductId), '4.25'))
})

test('computeLoyaltyFreeDiscount is zero when nothing eligible', () => {
  const items = [{ productId: 2, unitPrice: '2.00' }]
  assert.ok(eq(computeLoyaltyFreeDiscount(items, { 1: true }), '0'))
})
