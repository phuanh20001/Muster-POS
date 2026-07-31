import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveOnlineOrderItems } from '@/lib/onlineOrderItems'

// In-memory product catalogue shaped like the Prisma `findMany(... include ...)`
// result. Injected via { loadProducts } so no database is required.
const CATALOG = {
  1: {
    id: 1, name: 'Latte', price: '5.00', available: true, isCombo: false, stock: null,
    loyaltyEnabled: true,
    sizes: [{ id: 10, label: 'Regular', price: '5.00' }, { id: 11, label: 'Large', price: '6.50' }],
    modifiers: [{ id: 100, name: 'Extra shot', price: '0.80', available: true }],
    category: { modifiers: [{ id: 200, name: 'Oat milk', price: '0.60', available: true }] },
  },
  2: {
    id: 2, name: 'Muffin', price: '4.00', available: true, isCombo: false, stock: 3,
    loyaltyEnabled: false,
    sizes: [],
    modifiers: [],
    category: { modifiers: [{ id: 200, name: 'Oat milk', price: '0.60', available: true }] },
  },
  3: {
    id: 3, name: 'Sold Out Cake', price: '7.00', available: true, isCombo: false, stock: 0,
    loyaltyEnabled: false, sizes: [], modifiers: [], category: { modifiers: [] },
  },
  4: {
    id: 4, name: 'Unavailable Item', price: '3.00', available: false, isCombo: false, stock: null,
    loyaltyEnabled: false, sizes: [], modifiers: [], category: { modifiers: [] },
  },
  5: {
    id: 5, name: 'Combo Deal', price: '9.00', available: true, isCombo: true, stock: null,
    loyaltyEnabled: false, sizes: [], modifiers: [], category: { modifiers: [] },
  },
}
const loadProducts = async (ids) => ids.map((id) => CATALOG[id]).filter(Boolean)
const resolve = (items) => resolveOnlineOrderItems(items, { loadProducts })

test('SECURITY: a tampered client unitPrice is ignored — the DB price wins', async () => {
  const r = await resolve([{ productId: 2, quantity: 1, unitPrice: '0.01' }])
  assert.equal(r.ok, true)
  assert.equal(r.items[0].unitPrice, '4.00') // DB price, not the 0.01 the client sent
})

test('SECURITY: size price comes from the DB size, not the client', async () => {
  const r = await resolve([{ productId: 1, quantity: 1, size: 'Large', unitPrice: '0.01' }])
  assert.equal(r.ok, true)
  assert.equal(r.items[0].unitPrice, '6.50')
  assert.equal(r.items[0].size, 'Large')
})

test('SECURITY: modifier price comes from the DB, not the client', async () => {
  const r = await resolve([{
    productId: 1, quantity: 1, size: 'Regular',
    modifiers: [{ id: 100, source: 'product', price: '0.00', name: 'HACKED' }],
  }])
  assert.equal(r.ok, true)
  assert.equal(r.items[0].modifiers[0].price, '0.80')
  assert.equal(r.items[0].modifiers[0].name, 'Extra shot')
})

test('combos are rejected on the public channel (masked as "Product not found")', async () => {
  const r = await resolve([{ productId: 5, quantity: 1 }])
  assert.equal(r.ok, false)
  assert.equal(r.error, 'Product not found')
})

test('unavailable products and out-of-stock items are rejected', async () => {
  assert.equal((await resolve([{ productId: 4, quantity: 1 }])).ok, false)
  const oos = await resolve([{ productId: 3, quantity: 1 }])
  assert.equal(oos.ok, false)
  assert.match(oos.error, /out of stock/)
})

test('a limited-stock product rejects a quantity above stock but allows within', async () => {
  assert.equal((await resolve([{ productId: 2, quantity: 4 }])).ok, false) // stock is 3
  assert.equal((await resolve([{ productId: 2, quantity: 3 }])).ok, true)
})

test('a sized product requires a valid size', async () => {
  assert.equal((await resolve([{ productId: 1, quantity: 1 }])).ok, false) // no size
  assert.equal((await resolve([{ productId: 1, quantity: 1, size: 'Venti' }])).ok, false) // bad size
})

test('an unknown product id and an unknown modifier are rejected', async () => {
  assert.equal((await resolve([{ productId: 999, quantity: 1 }])).ok, false)
  const badMod = await resolve([{
    productId: 1, quantity: 1, size: 'Regular',
    modifiers: [{ id: 12345, source: 'product' }],
  }])
  assert.equal(badMod.ok, false)
})

test('quantity is validated (positive integer, capped at 99)', async () => {
  assert.equal((await resolve([{ productId: 2, quantity: 0 }])).ok, false)
  assert.equal((await resolve([{ productId: 2, quantity: -1 }])).ok, false)
  assert.equal((await resolve([{ productId: 2, quantity: 100 }])).ok, false)
})

test('a category modifier is accepted only when the product has no own modifiers', async () => {
  // Muffin (id 2) has no own modifiers -> inherits the category "Oat milk" (200)
  const inherit = await resolve([{
    productId: 2, quantity: 1, modifiers: [{ id: 200, source: 'category' }],
  }])
  assert.equal(inherit.ok, true)
  assert.equal(inherit.items[0].modifiers[0].id, 200)

  // Latte (id 1) HAS its own modifiers -> the inherited category add-on is suppressed,
  // so a stale client trying to attach category modifier 200 is rejected.
  const suppressed = await resolve([{
    productId: 1, quantity: 1, size: 'Regular', modifiers: [{ id: 200, source: 'category' }],
  }])
  assert.equal(suppressed.ok, false)
})

test('empty or non-array items are rejected', async () => {
  assert.equal((await resolve([])).ok, false)
  assert.equal((await resolve(null)).ok, false)
})
