import { randomUUID } from 'crypto'
import { getStripe, currency } from '@/lib/terminal'
import { getSquare, squareCurrency, squareLocationId } from '@/lib/square'
import { blockedBrandsOnline } from '@/lib/paymentSettings'
import { PROVIDERS } from '@/lib/paymentProvider'
import { D, sum, toCents, gt } from '@/lib/money'

function buildLineItemLabels(item) {
  const sizeLabel = item.size ? ` (${item.size})` : ''
  const modsLabel = item.modifiers?.length
    ? ' + ' + item.modifiers.map((m) => m.name).join(', ')
    : ''
  const modsCostPerUnit = sum(item.modifiers, (m) => m.price)
  const unitTotal = D(item.unitPrice).plus(modsCostPerUnit)
  return {
    name: `${item.productName}${sizeLabel}${modsLabel}`,
    unitTotal,
    quantity: item.quantity,
  }
}

async function stripeCreateOnlineCheckout({
  orderId,
  items,
  surchargeAmount,
  discountAmount,
  discountLabel = 'Voucher',
  paymentSettings,
  origin,
  returnBase,
}) {
  const stripe = getStripe()
  const CURRENCY = currency()

  const lineItems = items.map((item) => {
    const { name, unitTotal, quantity } = buildLineItemLabels(item)
    return {
      price_data: {
        currency: CURRENCY,
        product_data: { name },
        unit_amount: toCents(unitTotal),
      },
      quantity,
    }
  })

  if (gt(surchargeAmount, 0)) {
    const pct = paymentSettings.cardSurchargeType === 'PERCENT'
      ? ` (${paymentSettings.cardSurchargeValue}%)`
      : ''
    lineItems.push({
      price_data: {
        currency: CURRENCY,
        product_data: { name: `Card surcharge${pct}` },
        unit_amount: toCents(surchargeAmount),
      },
      quantity: 1,
    })
  }

  let discounts
  if (gt(discountAmount, 0)) {
    const coupon = await stripe.coupons.create({
      amount_off: toCents(discountAmount),
      currency: CURRENCY,
      duration: 'once',
      name: discountLabel,
    })
    discounts = [{ coupon: coupon.id }]
  }

  const blocked = blockedBrandsOnline(paymentSettings.blockedBrands)

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    client_reference_id: String(orderId),
    line_items: lineItems,
    ...(discounts ? { discounts } : {}),
    ...(blocked.length
      ? { payment_method_options: { card: { restrictions: { brands_blocked: blocked } } } }
      : {}),
    // Must not outlive the stale-order sweep (1h), or a customer could pay for
    // an order the sweep already deleted. Stripe's minimum is 30 minutes.
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    success_url: `${origin}${returnBase}/success?checkoutRef={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}${returnBase}`,
    metadata: { orderId: String(orderId) },
  })

  return { checkoutUrl: session.url, checkoutRef: session.id }
}

// Square's hosted checkout requires a buyer phone/email in its Contact block
// and offers no toggle to hide it. The customer already gave us their phone on
// our own order form, so prepopulate it (in E.164) to save re-entry. A local
// 0XXXXXXXXX AU number maps to +61XXXXXXXXX; anything unexpected is left blank.
function auPhoneToE164(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '')
  if (digits.length === 10 && digits.startsWith('0')) return `+61${digits.slice(1)}`
  return null
}

async function squareCreateOnlineCheckout({
  orderId,
  items,
  surchargeAmount,
  discountAmount,
  discountLabel = 'Voucher',
  origin,
  returnBase,
  trackingToken,
  phone,
}) {
  const locationId = squareLocationId()
  if (!locationId) throw new Error('SQUARE_LOCATION_ID not configured')

  const currency = squareCurrency()
  const square = getSquare()

  const lineItems = items.map((item) => {
    const { name, unitTotal, quantity } = buildLineItemLabels(item)
    return {
      name,
      quantity: String(quantity),
      basePriceMoney: { amount: BigInt(toCents(unitTotal)), currency },
    }
  })

  if (gt(surchargeAmount, 0)) {
    lineItems.push({
      name: 'Card surcharge',
      quantity: '1',
      basePriceMoney: { amount: BigInt(toCents(surchargeAmount)), currency },
    })
  }

  const squareOrder = {
    locationId,
    referenceId: String(orderId),
    lineItems,
  }

  if (gt(discountAmount, 0)) {
    squareOrder.discounts = [{
      name: discountLabel,
      type: 'FIXED_AMOUNT',
      scope: 'ORDER',
      amountMoney: { amount: BigInt(toCents(discountAmount)), currency },
    }]
  }

  const buyerPhoneNumber = auPhoneToE164(phone)

  const res = await square.checkout.paymentLinks.create({
    idempotencyKey: randomUUID(),
    order: squareOrder,
    checkoutOptions: {
      redirectUrl: `${origin}${returnBase}/success?checkoutRef=${encodeURIComponent(trackingToken)}`,
    },
    ...(buyerPhoneNumber ? { prePopulatedData: { buyerPhoneNumber } } : {}),
    paymentNote: `${process.env.DOCKET_BRAND_NAME ?? 'DreamyCafe'} order #${orderId}`,
  })

  const link = res.paymentLink || res.result?.paymentLink
  if (!link?.url || !link?.id) throw new Error('Square payment link not returned')

  return { checkoutUrl: link.url, checkoutRef: link.id }
}

export async function createOnlineCheckout(providerName, params) {
  if (providerName === PROVIDERS.SQUARE) return squareCreateOnlineCheckout(params)
  return stripeCreateOnlineCheckout(params)
}

async function stripeVerifyOnlinePayment(checkoutRef) {
  const stripe = getStripe()
  const session = await stripe.checkout.sessions.retrieve(checkoutRef)
  const paid = session.payment_status === 'paid'
  const paymentRef = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent?.id ?? null
  return { paid, paymentRef, provider: PROVIDERS.STRIPE }
}

async function squareVerifyOnlinePayment(order) {
  const linkId = order.checkoutRef
  if (!linkId) return { paid: false, paymentRef: null, provider: PROVIDERS.SQUARE }

  const square = getSquare()
  const linkRes = await square.checkout.paymentLinks.get({ id: linkId })
  const link = linkRes.paymentLink || linkRes.result?.paymentLink
  const squareOrderId = link?.orderId
  if (!squareOrderId) return { paid: false, paymentRef: null, provider: PROVIDERS.SQUARE }

  const orderRes = await square.orders.get({ orderId: squareOrderId })
  const squareOrder = orderRes.order || orderRes.result?.order

  const paymentId = squareOrder?.tenders?.find((t) => t.paymentId)?.paymentId
    || squareOrder?.tenders?.[0]?.paymentId
  if (!paymentId) return { paid: false, paymentRef: null, provider: PROVIDERS.SQUARE }

  const payRes = await square.payments.get({ paymentId })
  const payment = payRes.payment || payRes.result?.payment
  if (payment?.status !== 'COMPLETED') {
    return { paid: false, paymentRef: null, provider: PROVIDERS.SQUARE }
  }

  return {
    paid: true,
    paymentRef: `pay:${paymentId}`,
    provider: PROVIDERS.SQUARE,
    squareOrderId,
  }
}

export async function verifyOnlinePayment(providerName, { checkoutRef, order }) {
  if (providerName === PROVIDERS.SQUARE) return squareVerifyOnlinePayment(order)
  return stripeVerifyOnlinePayment(checkoutRef)
}

// Stop a checkout being payable after its order is swept. Stripe sessions
// self-expire via expires_at, so only Square payment links (which never
// expire) need active deactivation. Throws on failure so callers can keep
// the order and retry next sweep.
export async function deactivateOnlineCheckout(providerName, checkoutRef) {
  if (providerName !== PROVIDERS.SQUARE || !checkoutRef) return
  const square = getSquare()
  await square.checkout.paymentLinks.delete({ id: checkoutRef })
}

export async function resolveOrderIdFromSquarePayment(payment) {
  const squareOrderId = payment.orderId || payment.order_id
  if (!squareOrderId) return null

  const square = getSquare()
  const orderRes = await square.orders.get({ orderId: squareOrderId })
  const squareOrder = orderRes.order || orderRes.result?.order
  const ref = squareOrder?.referenceId
  if (!ref) return null

  const orderId = parseInt(ref, 10)
  return Number.isFinite(orderId) ? orderId : null
}
