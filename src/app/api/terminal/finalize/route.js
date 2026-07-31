import { NextResponse } from 'next/server'
import { getActiveProvider, getProvider } from '@/lib/paymentProvider'

async function resolveProvider(override) {
  if (override === 'STRIPE' || override === 'SQUARE') return getProvider(override)
  return getActiveProvider()
}

// Called once the reader authorizes the card. For Stripe this reads the real
// card brand from the authorization and either captures or voids (blocked
// brand). For Square the checkout has already auto-captured and brand blocking
// is not supported, so the active provider's finalize is a pass-through.
export async function POST(request) {
  try {
    const body = await request.json()
    if (!body.paymentIntentId) {
      return NextResponse.json({ error: 'paymentIntentId required' }, { status: 400 })
    }

    const provider = await resolveProvider(body.provider)
    const result = await provider.finalize(body.paymentIntentId)
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Failed to finalize payment' }, { status: 500 })
  }
}
