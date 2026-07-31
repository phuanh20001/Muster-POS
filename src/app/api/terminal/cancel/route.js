import { NextResponse } from 'next/server'
import { getActiveProvider } from '@/lib/paymentProvider'

export async function POST(request) {
  try {
    const body = await request.json()
    const provider = await getActiveProvider()
    await provider.cancel({ paymentRef: body.paymentIntentId, readerName: body.readerName || 'COUNTER' })
    return NextResponse.json({ cancelled: true })
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Failed to cancel' }, { status: 500 })
  }
}
