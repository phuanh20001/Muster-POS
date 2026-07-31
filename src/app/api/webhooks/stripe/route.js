import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { fulfillPaidOrder } from '@/lib/fulfillment'
import { PROVIDERS } from '@/lib/paymentProvider'

export async function POST(request) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-05-27.dahlia' })
  const rawBody = await request.text()
  const sig = request.headers.get('stripe-signature')

  let event
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.error('[stripe webhook] signature verification failed:', err.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    const orderId = parseInt(session.client_reference_id)
    if (!orderId) return NextResponse.json({ received: true })

    const paymentRef = typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id ?? null

    try {
      await fulfillPaidOrder(orderId, {
        checkoutRef: session.id,
        paymentRef,
        paymentProvider: PROVIDERS.STRIPE,
      })
    } catch (err) {
      console.error('[stripe webhook] fulfillment failed:', err)
      return NextResponse.json({ error: 'Fulfillment failed' }, { status: 500 })
    }
  }

  return NextResponse.json({ received: true })
}
