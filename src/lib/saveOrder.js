// Retrying an order POST is ONLY safe when the payload carries a paymentIntentId.
// POST /api/orders dedupes on that key (returns the already-recorded order, and
// catches the unique-index race), so a retry can never charge twice or ring the
// sale twice. A cash sale has no such key — if its response were merely lost in
// flight, a retry would record the sale a second time — so cash is never retried.
//
// This exists because the card is charged BEFORE the order is saved: a transient
// failure in that gap used to leave a real charge with no order, for staff to spot
// and refund by hand. Retrying the save (never the charge) recovers it silently.

const RETRY_DELAY_MS = 1000
const MAX_ATTEMPTS = 3

// Retry only what a retry can actually fix: a response that never arrived, the
// card-verify losing a race with Square's capture (402), or a server fault (5xx).
// A 400-class rejection is a bad payload — retrying just fails again, slower.
function isTransient(res) {
  if (!res) return true
  if (res.status === 402) return true
  return res.status >= 500
}

export async function postOrderWithRetry(payload, { onRetry } = {}) {
  const retryable = Boolean(payload.paymentIntentId)
  const maxAttempts = retryable ? MAX_ATTEMPTS : 1
  let res = null
  let attempt = 0

  while (attempt < maxAttempts) {
    attempt += 1
    if (attempt > 1) {
      onRetry?.(attempt, maxAttempts)
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS))
    }
    try {
      res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } catch {
      res = null
    }
    if (res?.ok) return { ok: true, res, attempts: attempt, recovered: attempt > 1 }
    if (!isTransient(res)) break
  }

  return { ok: false, res, attempts: attempt, recovered: false }
}

export async function readOrderError(res) {
  try {
    return (await res?.json())?.error ?? ''
  } catch {
    return ''
  }
}
