import test from 'node:test'
import assert from 'node:assert/strict'
import { D, roundCents, toCents, fromCents, sum, add, sub, eq, cmp, min, max } from '@/lib/money'

test('float error is real, Decimal is exact', () => {
  assert.notEqual(0.1 + 0.2, 0.3)
  assert.ok(D('0.1').plus(D('0.2')).eq(D('0.3')))
})

test('order total is exact to the cent (subtotal + surcharge - discount)', () => {
  const subtotal = D('10.10')
  const surcharge = roundCents(subtotal.times('0.015')) // 0.1515 -> 0.15
  const total = subtotal.plus(surcharge).minus(D('2.00'))
  assert.ok(eq(surcharge, '0.15'))
  assert.ok(eq(total, '8.25'))
})

test('proportional split sums exactly with the last leg absorbing the remainder', () => {
  const grand = D('10.00')
  const even = roundCents(grand.div(3)) // 3.33
  const shares = [even, even, grand.minus(even.times(2))] // 3.33, 3.33, 3.34
  assert.ok(eq(sum(shares), grand))
  assert.ok(eq(shares[2], '3.34'))
})

test('7-way split of an odd amount reconciles', () => {
  const g = D('19.99')
  const part = roundCents(g.div(7))
  const legs = Array.from({ length: 6 }, () => part)
  legs.push(g.minus(part.times(6)))
  assert.ok(eq(sum(legs), g))
})

test('toCents produces the integer minor units processors expect (half-up)', () => {
  assert.equal(toCents('12.30'), 1230)
  assert.equal(toCents('100'), 10000)
  assert.equal(toCents('0.005'), 1) // rounds half up
  assert.equal(toCents(D('19.99')), 1999)
})

test('fromCents is the inverse of toCents', () => {
  assert.ok(eq(fromCents(1230), '12.30'))
  assert.ok(eq(fromCents(toCents('7.77')), '7.77'))
})

test('money round-trips losslessly as a JSON string (how it crosses the API)', () => {
  const v = D('1234.56')
  const parsed = JSON.parse(JSON.stringify({ amount: v }))
  assert.equal(parsed.amount, '1234.56')
  assert.ok(eq(D(parsed.amount), v))
})

test('helpers: add/sub/min/max/cmp and null-safety', () => {
  assert.ok(eq(add('1.11', '2.22', '3.33'), '6.66'))
  assert.ok(eq(sub('1.00', '1.50'), '-0.50'))
  assert.ok(eq(min('3.34', '3.33', '3.35'), '3.33'))
  assert.ok(eq(max('3.34', '3.33', '3.35'), '3.35'))
  assert.equal(cmp('1.00', '1.00'), 0)
  assert.equal(cmp('1.01', '1.00'), 1)
  assert.equal(cmp('0.99', '1.00'), -1)
  assert.ok(eq(D(null), '0'))
  assert.ok(eq(D(''), '0'))
  assert.ok(eq(D(undefined), '0'))
})
