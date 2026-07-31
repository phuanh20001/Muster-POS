import { randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'
import { getStripe, resolveReaderId, isTestMode, currency } from '@/lib/terminal'
import { getSquare, resolveSquareDeviceId, squareCurrency, squareLocationId } from '@/lib/square'
import { getPaymentSettings, isBrandBlocked, brandLabel } from '@/lib/paymentSettings'
import { terminalDeadlineIso } from '@/lib/terminalDeadline'

// Provider abstraction so the POS can charge a card through Stripe OR Square.
// The POS client only ever talks to our /api/terminal/* routes; those routes
// dispatch here. Both adapters expose the SAME shape and return the SAME
// canonical status strings the client already understands (Stripe-style:
// 'processing' | 'requires_capture' | 'succeeded' | 'canceled' |
// 'requires_payment_method'), so CheckoutModal and the split-leg flow are
// unchanged regardless of which provider is active.
//
// `paymentRef` is a Stripe PaymentIntent id when provider=STRIPE and a Square
// payment id when provider=SQUARE; both are stored in Order.paymentIntentId
// (comma-joined for split orders). Order.paymentProvider records which one made
// the charge, so refunds/verification of a historical order always route to the
// processor that created it — even after the active provider is switched.

export const PROVIDERS = { STRIPE: 'STRIPE', SQUARE: 'SQUARE' }

function normalizeProvider(name) {
  return name === PROVIDERS.SQUARE ? PROVIDERS.SQUARE : PROVIDERS.STRIPE
}

export async function getInPersonProviderName() {
  const { provider } = await getPaymentSettings()
  return normalizeProvider(provider)
}

export async function getOnlineProviderName() {
  const { onlineProvider } = await getPaymentSettings()
  return normalizeProvider(onlineProvider)
}

export async function getActiveProviderName() {
  return getInPersonProviderName()
}

export function getProvider(name) {
  return name === PROVIDERS.SQUARE ? squareProvider : stripeProvider
}

export async function getInPersonProvider() {
  return getProvider(await getInPersonProviderName())
}

export async function getOnlineProvider() {
  return getProvider(await getOnlineProviderName())
}

export async function getActiveProvider() {
  return getInPersonProvider()
}

// --- Stripe adapter ---------------------------------------------------------
// Thin wrappers over the existing Stripe logic (mirrors the original route
// bodies), keeping the manual-capture + brand-blocking behaviour intact.
const stripeProvider = {
  name: PROVIDERS.STRIPE,

  async charge({ amount, readerName }) {
    const readerId = await resolveReaderId(readerName || 'COUNTER')
    if (!readerId) throw new Error('No payment terminal configured')

    const stripe = getStripe()
    const pi = await stripe.paymentIntents.create({
      amount,
      currency: currency(),
      payment_method_types: ['card_present'],
      capture_method: 'manual',
    })
    await stripe.terminal.readers.processPaymentIntent(readerId, { payment_intent: pi.id })

    if (isTestMode()) {
      await stripe.testHelpers.terminal.readers
        .presentPaymentMethod(readerId)
        .catch((err) => console.error('[terminal] simulate tap failed:', err.message))
    }
    return { paymentRef: pi.id, status: pi.status }
  },

  async getStatus(paymentRef) {
    const pi = await getStripe().paymentIntents.retrieve(paymentRef)
    return { status: pi.status, lastError: pi.last_payment_error?.message ?? null }
  },

  async finalize(paymentRef) {
    const stripe = getStripe()
    const pi = await stripe.paymentIntents.retrieve(paymentRef, { expand: ['latest_charge'] })
    if (pi.status !== 'requires_capture') return { status: pi.status }

    const brand = pi.latest_charge?.payment_method_details?.card_present?.brand || null
    const { blockedBrands } = await getPaymentSettings()
    if (isBrandBlocked(blockedBrands, brand)) {
      await stripe.paymentIntents.cancel(pi.id).catch(() => {})
      return {
        status: 'blocked',
        brand,
        error: `${brandLabel(brand)} is not accepted here. Please use another card.`,
      }
    }
    const captured = await stripe.paymentIntents.capture(pi.id)
    return { status: captured.status, brand }
  },

  async cancel({ paymentRef, readerName }) {
    const stripe = getStripe()
    const readerId = await resolveReaderId(readerName || 'COUNTER')
    if (readerId) await stripe.terminal.readers.cancelAction(readerId).catch(() => {})
    if (paymentRef) await stripe.paymentIntents.cancel(paymentRef).catch(() => {})
  },

  async verify(paymentRef) {
    const pi = await getStripe().paymentIntents.retrieve(paymentRef)
    return ['succeeded', 'requires_capture'].includes(pi.status)
  },

  async getCardReceiptDetails(paymentRef) {
    const pi = await getStripe().paymentIntents.retrieve(paymentRef, { expand: ['latest_charge'] })
    const charge = pi.latest_charge
    const card = charge?.payment_method_details?.card_present
    if (!card?.last4 && !charge?.authorization_code) return null
    return {
      last4: card?.last4 || null,
      brand: card?.brand ? brandLabel(card.brand) : null,
      authCode: charge?.authorization_code || null,
      reference: charge?.id || pi.id,
    }
  },

  async refund(paymentRef) {
    await getStripe().refunds.create({ payment_intent: paymentRef })
  },
}

// --- Square adapter ---------------------------------------------------------
// Square Terminal checkout is poll-based like Stripe, but auto-captures (no
// auth/void), so finalize is a pass-through and brand blocking does not apply.
// paymentRef for Square is the Square *payment id* (checkout.paymentIds[0]),
// which is what RefundPayment and GetPayment key off.

// Map Square TerminalCheckout/Payment states to the client's canonical strings.
function squareCheckoutStatus(checkout) {
  switch (checkout?.status) {
    case 'PENDING':
    case 'IN_PROGRESS':
      return 'processing'
    case 'COMPLETED':
      // requires_capture lets runTerminalCharge proceed to finalize, matching
      // the Stripe flow; the Square checkout is already captured by then.
      return 'requires_capture'
    case 'CANCELED':
    case 'CANCEL_REQUESTED':
      return 'canceled'
    default:
      return 'processing'
  }
}

// Square SDK returns BigInt money amounts; our app works in dollars/Number.
function toSquareMinor(amount) {
  return BigInt(amount)
}

const squareProvider = {
  name: PROVIDERS.SQUARE,

  async charge({ amount, readerName }) {
    const deviceId = await resolveSquareDeviceId(readerName || 'COUNTER')
    if (!deviceId) throw new Error('No payment terminal configured')

    const { terminalWaitSeconds } = await getPaymentSettings()
    const square = getSquare()
    const res = await square.terminal.checkouts.create({
      idempotencyKey: randomUUID(),
      checkout: {
        amountMoney: { amount: toSquareMinor(amount), currency: squareCurrency() },
        deviceOptions: { deviceId, skipReceiptScreen: true },
        deadlineDuration: terminalDeadlineIso(terminalWaitSeconds),
      },
    })
    const checkout = res.checkout || res.result?.checkout
    // The payment id isn't known until the checkout completes — track by
    // checkout id until then, swapping to the payment id in getStatus.
    return { paymentRef: `chk:${checkout.id}`, status: squareCheckoutStatus(checkout) }
  },

  async getStatus(paymentRef) {
    const { type, id } = parseSquareRef(paymentRef)
    if (type === 'chk') {
      const res = await getSquare().terminal.checkouts.get({ checkoutId: id })
      const checkout = res.checkout || res.result?.checkout
      const status = squareCheckoutStatus(checkout)
      // Surface the resolved payment id so the client carries it forward.
      const paymentId = checkout?.paymentIds?.[0] || null
      return {
        status,
        lastError: checkout?.status === 'CANCELED' ? (checkout?.cancelReason || null) : null,
        paymentRef: paymentId ? `pay:${paymentId}` : paymentRef,
      }
    }
    // Already a payment id — confirm it completed.
    const ok = await this.verify(paymentRef)
    return { status: ok ? 'requires_capture' : 'requires_payment_method', lastError: ok ? null : 'Payment not completed' }
  },

  // Square auto-captures; nothing to capture/void and no brand block here.
  async finalize() {
    return { status: 'succeeded' }
  },

  async cancel({ paymentRef }) {
    const { type, id } = parseSquareRef(paymentRef)
    if (type === 'chk' && id) {
      await getSquare().terminal.checkouts.cancel({ checkoutId: id }).catch(() => {})
    }
  },

  // A Terminal checkout reports COMPLETED while the Payment it created is still
  // APPROVED — the card is authorized and autocomplete captures it moments later.
  // Both mean the customer paid, so both count here, mirroring the Stripe adapter
  // (which accepts requires_capture alongside succeeded). Accepting only COMPLETED
  // lost the race intermittently and rejected real payments, leaving the card
  // charged with no order saved.
  async verify(paymentRef) {
    const { id } = parseSquareRef(paymentRef)
    if (!id) return false
    const res = await getSquare().payments.get({ paymentId: id })
    const payment = res.payment || res.result?.payment
    return payment?.status === 'COMPLETED' || payment?.status === 'APPROVED'
  },

  async getCardReceiptDetails(paymentRef) {
    const { id } = parseSquareRef(paymentRef)
    if (!id) return null
    const res = await getSquare().payments.get({ paymentId: id })
    const payment = res.payment || res.result?.payment
    const cardDetails = payment?.cardDetails || payment?.card_details
    const card = cardDetails?.card
    const last4 = card?.last4 || card?.last_4 || null
    const brand = card?.cardBrand || card?.card_brand || null
    const authCode = cardDetails?.authResultCode || cardDetails?.auth_result_code || null
    const reference = payment?.receiptNumber || payment?.receipt_number || id
    if (!last4 && !authCode) return null
    return { last4, brand, authCode, reference }
  },

  async refund(paymentRef) {
    const { id } = parseSquareRef(paymentRef)
    if (!id) throw new Error('Missing Square payment id')
    const square = getSquare()
    const res = await square.payments.get({ paymentId: id })
    const payment = res.payment || res.result?.payment
    if (!payment) throw new Error('Square payment not found')
    await square.refunds.refundPayment({
      idempotencyKey: randomUUID(),
      paymentId: id,
      amountMoney: payment.amountMoney,
    })
  },
}

// A Square paymentRef is namespaced: "chk:<checkoutId>" before the tap
// completes, "pay:<paymentId>" once we know the payment id. Bare ids (legacy /
// stored payment ids) are treated as payment ids.
function parseSquareRef(ref) {
  if (!ref) return { type: null, id: null }
  if (ref.startsWith('chk:')) return { type: 'chk', id: ref.slice(4) }
  if (ref.startsWith('pay:')) return { type: 'pay', id: ref.slice(4) }
  return { type: 'pay', id: ref }
}

export async function getCardReceiptDetailsForOrder(order) {
  if (!order?.paymentIntentId) return []
  const provider = getProvider(order.paymentProvider || PROVIDERS.STRIPE)
  if (!provider.getCardReceiptDetails) return []

  const details = []
  for (const ref of order.paymentIntentId.split(',').filter(Boolean)) {
    try {
      const row = await provider.getCardReceiptDetails(ref)
      if (row) details.push(row)
    } catch (err) {
      console.error('[payment] card receipt details failed:', err.message)
    }
  }
  return details
}
