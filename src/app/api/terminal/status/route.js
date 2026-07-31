import { NextResponse } from 'next/server'
import { getActiveProvider, getProvider } from '@/lib/paymentProvider'

async function resolveProvider(override) {
  if (override === 'STRIPE' || override === 'SQUARE') return getProvider(override)
  return getActiveProvider()
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const paymentIntentId = searchParams.get('paymentIntentId')
    if (!paymentIntentId) {
      return NextResponse.json({ error: 'paymentIntentId required' }, { status: 400 })
    }

    const provider = await resolveProvider(searchParams.get('provider'))
    const { status, lastError, paymentRef } = await provider.getStatus(paymentIntentId)

    // `paymentIntentId` echoes the canonical ref to use from here on. For Square
    // this swaps the temporary checkout ref for the real payment id once known;
    // for Stripe it's unchanged.
    return NextResponse.json({ status, lastError: lastError ?? null, paymentIntentId: paymentRef ?? paymentIntentId })
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Failed to fetch status' }, { status: 500 })
  }
}
