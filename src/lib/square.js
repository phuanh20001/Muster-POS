import { randomUUID } from 'crypto'
import { SquareClient, SquareEnvironment } from 'square'
import { prisma } from '@/lib/prisma'

// Square Terminal, server-driven smart-reader integration — the Square-side
// counterpart to src/lib/terminal.js (Stripe). The reader (Square Terminal /
// Handheld) holds its own connection to Square; the server creates a Terminal
// checkout and Square pushes it to the paired device. Card data never touches
// this app. Unlike Stripe there is no auth-then-void, so brand blocking is not
// supported here (enforced as a Stripe-only feature — see paymentProvider.js).

// Pin the Square-Version header (via `version`) so a future SDK reinstall can't
// silently change API behaviour and a Square version retirement is a scheduled
// event we control rather than a surprise outage. Matches the square@44 default.
export function getSquare() {
  return new SquareClient({
    token: process.env.SQUARE_ACCESS_TOKEN,
    version: '2026-05-20',
    environment: isSquareTestMode() ? SquareEnvironment.Sandbox : SquareEnvironment.Production,
  })
}

export function isSquareTestMode() {
  return (process.env.SQUARE_ENV || 'sandbox').toLowerCase() !== 'production'
}

export function squareCurrency() {
  return (process.env.SQUARE_CURRENCY || process.env.STRIPE_CURRENCY || 'AUD').toUpperCase()
}

export function squareLocationId() {
  return process.env.SQUARE_LOCATION_ID || null
}

export async function resolveSquareDeviceId(name = 'COUNTER') {
  try {
    const cfg = await prisma.terminalReader.findUnique({ where: { name } })
    if (cfg && cfg.enabled && cfg.squareDeviceId) return cfg.squareDeviceId
  } catch {
    // table not ready — fall back to env
  }
  return process.env.SQUARE_DEVICE_ID || null
}

export async function squareEnabled() {
  return (await resolveSquareDeviceId()) != null
}

function unwrapDeviceCode(res) {
  return res?.deviceCode || res?.result?.deviceCode || null
}

export function formatSquareDeviceCode(dc) {
  if (!dc) return null
  return {
    id: dc.id,
    code: dc.code,
    status: dc.status,
    deviceId: dc.deviceId || dc.device_id || null,
    pairBy: dc.pairBy || dc.pair_by || null,
    locationId: dc.locationId || dc.location_id || null,
  }
}

export async function createSquarePairingCode(name = `${process.env.DOCKET_BRAND_NAME ?? 'DreamyCafe'} counter`) {
  if (isSquareTestMode()) {
    throw new Error(
      'Square Sandbox cannot pair a physical Terminal. Use device id 9fa747a2-25ff-48ee-b078-04381f7c828f for testing, or set SQUARE_ENV=production to pair real hardware.'
    )
  }
  const locationId = squareLocationId()
  if (!locationId) throw new Error('SQUARE_LOCATION_ID is not set in .env')

  const res = await getSquare().devices.codes.create({
    idempotencyKey: randomUUID(),
    deviceCode: {
      name,
      productType: 'TERMINAL_API',
      locationId,
    },
  })
  const dc = unwrapDeviceCode(res)
  if (!dc?.code) throw new Error('Square did not return a pairing code')
  return formatSquareDeviceCode(dc)
}

export async function getSquarePairingCode(id) {
  const res = await getSquare().devices.codes.get({ id })
  const dc = unwrapDeviceCode(res)
  if (!dc) throw new Error('Pairing code not found')
  return formatSquareDeviceCode(dc)
}

// Payment Link orders stay OPEN with no fulfillment on Square's side, so they
// sit forever in the dashboard's "Active" tab. Terminal (in-person) orders
// auto-complete; this makes online orders match by attaching a COMPLETED PICKUP
// fulfillment once the payment lands. Cosmetic on Square's side only — never
// throws, so a failure here can't break the money-critical fulfillPaidOrder.
export async function completeSquareOnlineFulfillment(squareOrderId) {
  if (!squareOrderId) {
    console.log('[square autocomplete] no squareOrderId provided — skipping (non-Square path or unresolved order)')
    return false
  }
  console.log('[square autocomplete] START for squareOrderId=%s', squareOrderId)
  const square = getSquare()

  // Square bumps the order's version as the payment/DIGITAL fulfillment settle,
  // so a version read once can be stale by the time we update (VERSION_MISMATCH).
  // Re-fetch the current version and retry a few times to win that race.
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await square.orders.get({ orderId: squareOrderId })
      const order = res.order || res.result?.order
      if (!order) {
        console.log('[square autocomplete] orders.get returned no order for %s', squareOrderId)
        return false
      }

      console.log(
        '[square autocomplete] attempt %d fetched order version=%s existing fulfillments=%s',
        attempt,
        order.version,
        JSON.stringify(order.fulfillments?.map((f) => ({ type: f.type, state: f.state })) ?? []),
      )

      const alreadyDone = order.fulfillments?.some((f) => f.state === 'COMPLETED')
      if (alreadyDone) {
        console.log('[square autocomplete] already has a COMPLETED fulfillment — no-op')
        return true
      }

      // Square rejects orders.update unless the order body carries locationId, and
      // the Payment Link order already has a fulfillment (a DIGITAL one) — so mark
      // that existing fulfillment COMPLETED by uid rather than bolting on a PICKUP.
      const existing = order.fulfillments?.[0]
      const fulfillments = existing?.uid
        ? [{ uid: existing.uid, state: 'COMPLETED' }]
        : [{ type: 'PICKUP', state: 'COMPLETED', pickupDetails: { note: 'Auto-completed: online order paid' } }]

      const updateRes = await square.orders.update({
        orderId: squareOrderId,
        order: {
          locationId: order.locationId,
          version: order.version,
          fulfillments,
        },
        idempotencyKey: randomUUID(),
      })
      const updated = updateRes.order || updateRes.result?.order
      console.log(
        '[square autocomplete] SUCCESS orders.update → version=%s fulfillments=%s',
        updated?.version,
        JSON.stringify(updated?.fulfillments?.map((f) => ({ type: f.type, state: f.state })) ?? []),
      )
      return true
    } catch (err) {
      const isVersionMismatch = (err.errors || []).some((e) => e.code === 'VERSION_MISMATCH')
      if (isVersionMismatch && attempt < 4) {
        console.log('[square autocomplete] VERSION_MISMATCH on attempt %d — re-fetching and retrying', attempt)
        await new Promise((r) => setTimeout(r, 300 * attempt))
        continue
      }
      // Square packs the actionable detail in the response body (errors[]),
      // not err.message — log the whole thing so a silent failure is diagnosable.
      console.error('[square autocomplete] FAILED for %s:', squareOrderId, err.message)
      console.error('[square autocomplete] error detail:', JSON.stringify(err.errors || err.body || err.result || err, Object.getOwnPropertyNames(err)))
      return false
    }
  }
  return false
}
