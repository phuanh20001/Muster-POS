// Server-side voucher evaluation. The browser only proposes a code; the server
// decides whether it is valid and how much it is worth. Never trust a
// client-supplied discount.

import { D, roundCents, min, lt, gt, toDb } from '@/lib/money'

export const VOUCHER_TYPES = ['PERCENT', 'FIXED', 'FREE_ITEM']

// Validate + normalize an admin-supplied voucher payload for create/update.
// Returns { ok, data } (data holds only the provided fields) or { ok:false, error }.
// A PERCENT value is capped at 100 so a code can never drive a total negative;
// FIXED is capped at subtotal at redemption time by evaluateVoucher.
export function parseVoucherInput(body, { partial = false } = {}) {
  const data = {}

  if (!partial || 'code' in body) {
    const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : ''
    if (!code) return { ok: false, error: 'Code is required' }
    if (!/^[A-Z0-9-]{2,32}$/.test(code)) {
      return { ok: false, error: 'Code must be 2–32 letters, numbers, or dashes' }
    }
    data.code = code
  }

  if (!partial || 'type' in body) {
    if (!VOUCHER_TYPES.includes(body.type)) {
      return { ok: false, error: 'Invalid voucher type' }
    }
    data.type = body.type
  }

  const type = data.type ?? body.type
  if (!partial || 'value' in body) {
    let value = D(parseFloat(body.value))
    if (value.isNaN() || lt(value, 0)) return { ok: false, error: 'Value must be a positive number' }
    if (type === 'PERCENT' && gt(value, 100)) return { ok: false, error: 'Percentage cannot exceed 100' }
    if (type === 'FREE_ITEM') value = D(0)
    data.value = toDb(value)
  }

  if (!partial || 'minSubtotal' in body) {
    const minSub = D(parseFloat(body.minSubtotal) || 0)
    if (lt(minSub, 0)) return { ok: false, error: 'Minimum subtotal cannot be negative' }
    data.minSubtotal = toDb(minSub)
  }

  if (!partial || 'active' in body) {
    data.active = Boolean(body.active ?? true)
  }

  if (!partial || 'usageLimit' in body) {
    if (body.usageLimit == null || body.usageLimit === '') {
      data.usageLimit = null
    } else {
      const limit = parseInt(body.usageLimit, 10)
      if (!Number.isFinite(limit) || limit < 1) return { ok: false, error: 'Usage limit must be a positive whole number' }
      data.usageLimit = limit
    }
  }

  if (!partial || 'expiresAt' in body) {
    if (body.expiresAt == null || body.expiresAt === '') {
      data.expiresAt = null
    } else {
      const d = new Date(body.expiresAt)
      if (isNaN(d.getTime())) return { ok: false, error: 'Invalid expiry date' }
      data.expiresAt = d
    }
  }

  if (!partial || 'customerId' in body) {
    if (body.customerId == null || body.customerId === '') {
      data.customerId = null
    } else {
      const cid = parseInt(body.customerId, 10)
      if (!Number.isFinite(cid)) return { ok: false, error: 'Invalid customer' }
      data.customerId = cid
    }
  }

  return { ok: true, data }
}

export function evaluateVoucher(voucher, subtotal, items = [], customerId = null) {
  if (!voucher) return { ok: false, error: 'Invalid code' }
  if (!voucher.active) return { ok: false, error: 'This voucher is no longer active' }
  if (voucher.expiresAt && new Date() > new Date(voucher.expiresAt)) {
    return { ok: false, error: 'This voucher has expired' }
  }
  if (voucher.usageLimit != null && voucher.timesUsed >= voucher.usageLimit) {
    return { ok: false, error: 'This voucher has reached its usage limit' }
  }
  if (voucher.customerId != null && voucher.customerId !== customerId) {
    return { ok: false, error: 'This voucher is not valid for this account' }
  }
  const sub = D(subtotal)
  if (lt(sub, voucher.minSubtotal)) {
    return { ok: false, error: `Spend at least $${D(voucher.minSubtotal).toFixed(2)} to use this voucher` }
  }

  let discount = D(0)
  if (voucher.type === 'PERCENT') {
    discount = sub.times(D(voucher.value).div(100))
  } else if (voucher.type === 'FIXED') {
    discount = D(voucher.value)
  } else if (voucher.type === 'FREE_ITEM') {
    const prices = items.map((i) => D(i.unitPrice ?? 0)).filter((p) => p.gt(0))
    discount = prices.length ? min(...prices) : D(0)
  }

  discount = roundCents(min(discount, sub))
  return { ok: true, discount }
}
