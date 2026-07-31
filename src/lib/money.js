import Decimal from 'decimal.js'

// Money is exact: every monetary value flows through decimal.js, never a JS
// float. DB columns are Postgres Decimal(10,2); Prisma returns Decimal objects
// and serializes them to strings over JSON, so the client rebuilds them with
// D(...). Stripe/Square get integer minor units via toCents().

Decimal.set({ rounding: Decimal.ROUND_HALF_UP })

export { Decimal }

// Safe constructor. Accepts a decimal.js Decimal, a Prisma.Decimal (a foreign
// decimal.js instance — coerced via toString), a numeric string, or a number.
// null/undefined/'' become 0 so optional money fields are always summable.
export function D(x) {
  if (x === null || x === undefined || x === '') return new Decimal(0)
  if (x instanceof Decimal) return x
  if (typeof x === 'object' && typeof x.toString === 'function') return new Decimal(x.toString())
  return new Decimal(x)
}

export function add(...xs) {
  return xs.reduce((acc, x) => acc.plus(D(x)), new Decimal(0))
}

export function sub(a, b) {
  return D(a).minus(D(b))
}

export function mul(a, b) {
  return D(a).times(D(b))
}

export function div(a, b) {
  return D(a).div(D(b))
}

// Sum a list, optionally via a selector that returns a money-like value.
export function sum(arr, selector = (x) => x) {
  return (arr ?? []).reduce((acc, el) => acc.plus(D(selector(el))), new Decimal(0))
}

// Round to cents (2 dp). Use before persisting or comparing computed money.
export function roundCents(x) {
  return D(x).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
}

// Integer minor units for payment processors (e.g. $12.30 -> 1230).
export function toCents(x) {
  return D(x).times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()
}

export function fromCents(cents) {
  return D(cents).div(100)
}

// Comparisons. cmp returns -1 | 0 | 1.
export function cmp(a, b) {
  return D(a).cmp(D(b))
}
export function gt(a, b) {
  return D(a).gt(D(b))
}
export function gte(a, b) {
  return D(a).gte(D(b))
}
export function lt(a, b) {
  return D(a).lt(D(b))
}
export function lte(a, b) {
  return D(a).lte(D(b))
}
export function eq(a, b) {
  return D(a).eq(D(b))
}
export function isZero(x) {
  return D(x).isZero()
}
export function isNeg(x) {
  return D(x).isNegative()
}

export function min(...xs) {
  return xs.map(D).reduce((acc, x) => (x.lt(acc) ? x : acc))
}
export function max(...xs) {
  return xs.map(D).reduce((acc, x) => (x.gt(acc) ? x : acc))
}

export function neg(x) {
  return D(x).negated()
}

export function toNumber(x) {
  return D(x).toNumber()
}

// 2-dp string for display fallbacks and for writing to Decimal columns
// (Prisma accepts a numeric string for a Decimal field).
export function toFixed2(x) {
  return D(x).toFixed(2)
}

// Canonical value to persist into a Decimal(10,2) column.
export function toDb(x) {
  return D(x).toFixed(2)
}
