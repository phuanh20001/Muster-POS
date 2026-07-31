import test from 'node:test'
import assert from 'node:assert/strict'
import { parseVoucherInput, evaluateVoucher, VOUCHER_TYPES } from '@/lib/voucher'
import { eq } from '@/lib/money'

// --- parseVoucherInput (admin create/update validation) --------------------

test('parseVoucherInput rejects a bad code and caps PERCENT at 100', () => {
  assert.equal(parseVoucherInput({ code: '', type: 'PERCENT', value: '10' }).ok, false)
  assert.equal(parseVoucherInput({ code: 'bad code!', type: 'PERCENT', value: '10' }).ok, false)
  assert.equal(parseVoucherInput({ code: 'SAVE10', type: 'PERCENT', value: '150' }).ok, false)
  const good = parseVoucherInput({ code: 'save10', type: 'PERCENT', value: '10' })
  assert.equal(good.ok, true)
  assert.equal(good.data.code, 'SAVE10') // normalized upper-case
})

test('parseVoucherInput rejects negative value and unknown type', () => {
  assert.equal(parseVoucherInput({ code: 'X1', type: 'FIXED', value: '-5' }).ok, false)
  assert.equal(parseVoucherInput({ code: 'X1', type: 'NOPE', value: '5' }).ok, false)
})

test('parseVoucherInput forces FREE_ITEM value to 0', () => {
  const r = parseVoucherInput({ code: 'FREECOFFEE', type: 'FREE_ITEM', value: '99' })
  assert.equal(r.ok, true)
  assert.equal(r.data.value, '0.00')
})

test('VOUCHER_TYPES is the closed set the evaluator understands', () => {
  assert.deepEqual([...VOUCHER_TYPES].sort(), ['FIXED', 'FREE_ITEM', 'PERCENT'])
})

// --- evaluateVoucher (server-side redemption, never trust the client) ------

const base = { active: true, type: 'PERCENT', value: '10', minSubtotal: '0', timesUsed: 0, usageLimit: null, customerId: null, expiresAt: null }

test('PERCENT discount is computed from the subtotal', () => {
  const r = evaluateVoucher({ ...base, value: '10' }, '50.00')
  assert.equal(r.ok, true)
  assert.ok(eq(r.discount, '5.00'))
})

test('FIXED discount can never exceed the subtotal (no negative totals)', () => {
  const r = evaluateVoucher({ ...base, type: 'FIXED', value: '100' }, '10.00')
  assert.equal(r.ok, true)
  assert.ok(eq(r.discount, '10.00')) // capped at subtotal, not 100
})

test('FREE_ITEM discounts the cheapest positive-priced line', () => {
  const items = [{ unitPrice: '5.50' }, { unitPrice: '3.25' }, { unitPrice: '0' }]
  const r = evaluateVoucher({ ...base, type: 'FREE_ITEM', value: '0' }, '8.75', items)
  assert.equal(r.ok, true)
  assert.ok(eq(r.discount, '3.25'))
})

test('inactive / expired / usage-exhausted vouchers are rejected', () => {
  assert.equal(evaluateVoucher({ ...base, active: false }, '50').ok, false)
  assert.equal(evaluateVoucher({ ...base, expiresAt: '2000-01-01' }, '50').ok, false)
  assert.equal(evaluateVoucher({ ...base, usageLimit: 3, timesUsed: 3 }, '50').ok, false)
})

test('below-minimum-subtotal is rejected; at/above minimum is allowed', () => {
  assert.equal(evaluateVoucher({ ...base, minSubtotal: '20' }, '19.99').ok, false)
  assert.equal(evaluateVoucher({ ...base, minSubtotal: '20' }, '20.00').ok, true)
})

test('a customer-scoped voucher only applies to that customer', () => {
  assert.equal(evaluateVoucher({ ...base, customerId: 7 }, '50', [], 7).ok, true)
  assert.equal(evaluateVoucher({ ...base, customerId: 7 }, '50', [], 8).ok, false)
  assert.equal(evaluateVoucher({ ...base, customerId: 7 }, '50', [], null).ok, false)
})

test('a null voucher (unknown code) is rejected, not applied', () => {
  assert.equal(evaluateVoucher(null, '50').ok, false)
})
