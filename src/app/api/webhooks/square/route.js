import { NextResponse } from 'next/server'
import { WebhooksHelper } from 'square'
import { fulfillPaidOrder } from '@/lib/fulfillment'
import { resolveOrderIdFromSquarePayment } from '@/lib/onlineCheckout'
import { completeSquareOnlineFulfillment } from '@/lib/square'
import { PROVIDERS } from '@/lib/paymentProvider'

export async function POST(request) {
  const rawBody = await request.text()
  const signatureHeader = request.headers.get('x-square-hmacsha256-signature')
  const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY

  if (!signatureKey) {
    console.error('[square webhook] SQUARE_WEBHOOK_SIGNATURE_KEY not configured')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https'
  const notificationUrl = forwardedHost
    ? `${forwardedProto}://${forwardedHost}/api/webhooks/square`
    : `${new URL(request.url).origin}/api/webhooks/square`

  try {
    const valid = await WebhooksHelper.verifySignature({
      requestBody: rawBody,
      signatureHeader,
      signatureKey,
      notificationUrl,
    })
    if (!valid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }
  } catch (err) {
    console.error('[square webhook] signature verification failed:', err.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  let event
  try {
    event = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (event.type === 'payment.updated') {
    const payment = event.data?.object?.payment ?? event.data?.object
    if (payment?.status !== 'COMPLETED') {
      return NextResponse.json({ received: true })
    }

    const orderId = await resolveOrderIdFromSquarePayment(payment)
    if (!orderId) return NextResponse.json({ received: true })

    const paymentId = payment.id
    try {
      await fulfillPaidOrder(orderId, {
        paymentRef: paymentId ? `pay:${paymentId}` : null,
        paymentProvider: PROVIDERS.SQUARE,
      })
    } catch (err) {
      console.error('[square webhook] fulfillment failed:', err)
      return NextResponse.json({ error: 'Fulfillment failed' }, { status: 500 })
    }

    // Cosmetic: move the Square order out of the dashboard's "Active" tab so
    // online orders match reader orders. Best-effort — never blocks the ack.
    await completeSquareOnlineFulfillment(payment.orderId || payment.order_id)
  }

  return NextResponse.json({ received: true })
}
