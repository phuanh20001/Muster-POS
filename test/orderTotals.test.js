import test from 'node:test'
import assert from 'node:assert/strict'
import { modsTotalForItem, lineTotalForItem, itemsSubtotal } from '@/lib/orderTotals'
import { eq } from '@/lib/money'

const item = (o) => ({ unitPrice: '0', quantity: 1, modifiers: [], ...o })

test('modsTotalForItem sums modifier prices', () => {
  assert.ok(eq(modsTotalForItem(item({ modifiers: [{ price: '0.50' }, { price: '1.00' }] })), '1.50'))
  assert.ok(eq(modsTotalForItem(item({ modifiers: [] })), '0'))
})

test('lineTotalForItem = (unitPrice + mods + adjustment) * quantity', () => {
  const line = lineTotalForItem(item({
    unitPrice: '4.00',
    quantity: 3,
    modifiers: [{ price: '0.50' }],
    priceAdjustment: '1.00',
  }))
  // (4.00 + 0.50 + 1.00) * 3 = 16.50
  assert.ok(eq(line, '16.50'))
})

test('lineTotalForItem tolerates missing adjustment and empty modifiers', () => {
  assert.ok(eq(lineTotalForItem(item({ unitPrice: '3.50', quantity: 2 })), '7.00'))
})

test('itemsSubtotal includes modifiers and adjustments by default', () => {
  const items = [
    item({ unitPrice: '4.00', quantity: 2, modifiers: [{ price: '0.50' }], priceAdjustment: '1.00' }),
    item({ unitPrice: '3.00', quantity: 1 }),
  ]
  // line 1: (4.00*2) + (0.50*2) + (1.00*2) = 8 + 1 + 2 = 11
  // line 2: 3.00
  assert.ok(eq(itemsSubtotal(items), '14.00'))
})

test('itemsSubtotal can exclude adjustments (online subtotal path)', () => {
  const items = [item({ unitPrice: '4.00', quantity: 2, modifiers: [{ price: '0.50' }], priceAdjustment: '1.00' })]
  // adjustments excluded: (4.00*2) + (0.50*2) = 9.00
  assert.ok(eq(itemsSubtotal(items, { includeAdjustments: false }), '9.00'))
})

test('itemsSubtotal of empty/nullish list is zero', () => {
  assert.ok(eq(itemsSubtotal([]), '0'))
  assert.ok(eq(itemsSubtotal(null), '0'))
})
