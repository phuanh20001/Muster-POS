import { TERMINAL_DEADLINE_SECONDS } from '@/lib/terminalDeadline'

// Grace so the reader's own deadline resolves first (with Square's real reason)
// before the client's local safety-net timeout trips.
const POLL_GRACE_SEC = 8

export function runTerminalCharge(amount, {
  readerName = 'COUNTER',
  provider = null,
  finalize = true,
  timeoutSec = TERMINAL_DEADLINE_SECONDS,
  refs = null,
} = {}) {
  const providerQs = provider ? `&provider=${encodeURIComponent(provider)}` : ''
  return new Promise((resolve) => {
    fetch('/api/terminal/charge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, readerName, ...(provider ? { provider } : {}) }),
    })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) return resolve({ ok: false, error: data.error || 'Payment failed' })
        let piId = data.paymentIntentId
        if (refs?.piRef) refs.piRef.current = piId
        let elapsed = 0
        if (refs?.pollRef?.current) clearInterval(refs.pollRef.current)
        const poll = setInterval(async () => {
          elapsed += 2
          try {
            const sres = await fetch(`/api/terminal/status?paymentIntentId=${encodeURIComponent(piId)}${providerQs}`)
            const sdata = await sres.json()
            if (sdata.paymentIntentId) {
              piId = sdata.paymentIntentId
              if (refs?.piRef) refs.piRef.current = piId
            }
            if (sdata.status === 'succeeded' || sdata.status === 'requires_capture') {
              clearInterval(poll)
              if (refs?.pollRef) refs.pollRef.current = null
              if (!finalize) {
                if (refs?.piRef) refs.piRef.current = null
                return resolve({ ok: true, paymentIntentId: piId })
              }
              const fin = await fetch('/api/terminal/finalize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paymentIntentId: piId, ...(provider ? { provider } : {}) }),
              }).then((r) => r.json()).catch(() => ({ error: 'Could not finalize payment' }))
              if (refs?.piRef) refs.piRef.current = null
              if (fin.status === 'succeeded') resolve({ ok: true, paymentIntentId: piId })
              else resolve({ ok: false, error: fin.error || 'Card declined' })
            } else if (sdata.status === 'canceled' || (sdata.status === 'requires_payment_method' && sdata.lastError)) {
              clearInterval(poll)
              if (refs?.pollRef) refs.pollRef.current = null
              if (refs?.piRef) refs.piRef.current = null
              resolve({ ok: false, error: sdata.lastError || 'Card declined' })
            } else if (elapsed >= timeoutSec + POLL_GRACE_SEC) {
              // Safety net only: the reader's own deadline (timeoutSec) normally
              // fires first and comes back through the `canceled` branch above
              // with Square's real reason (e.g. TIMED_OUT). This trips just after,
              // so it only matters if the reader stopped responding entirely.
              clearInterval(poll)
              if (refs?.pollRef) refs.pollRef.current = null
              if (refs?.piRef) refs.piRef.current = null
              resolve({ ok: false, error: 'Timed out waiting for card' })
            }
          } catch {
            // transient — keep polling
          }
        }, 2000)
        if (refs?.pollRef) refs.pollRef.current = poll
      })
      .catch(() => resolve({ ok: false, error: 'Could not reach the terminal' }))
  })
}
