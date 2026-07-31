import { NextResponse } from 'next/server'
import { getActiveProvider, getProvider } from '@/lib/paymentProvider'
import { toCents } from '@/lib/money'

async function resolveProvider(override) {
  if (override === 'STRIPE' || override === 'SQUARE') return getProvider(override)
  return getActiveProvider()
}

export async function POST(request) {
  try {
    const body = await request.json()
    const amount = toCents(body.amount)
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
    }

    const provider = await resolveProvider(body.provider)
    const { paymentRef, status } = await provider.charge({ amount, readerName: body.readerName || 'COUNTER' })

    // Response key stays `paymentIntentId` so the POS client is provider-agnostic.
    return NextResponse.json({ paymentIntentId: paymentRef, status })
  } catch (err) {
    console.error('[terminal] charge error:', err)
    return NextResponse.json({ error: err.message || 'Failed to start payment' }, { status: 500 })
  }
}
