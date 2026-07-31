import { NextResponse } from 'next/server'
import { getPrintJob, clearFailedDocket, enqueueFailedDocket } from '@/lib/printQueue'
import { printOrderDocketStation } from '@/lib/printer'

export async function POST(request, { params }) {
  try {
    const { id } = await params
    const job = await getPrintJob(id)
    if (!job) return NextResponse.json({ error: 'Print job not found' }, { status: 404 })
    if (!job.order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

    try {
      await printOrderDocketStation(job.order, job.station)
      await clearFailedDocket({ orderId: job.orderId, station: job.station })
      return NextResponse.json({ ok: true })
    } catch (err) {
      const msg = err.message || 'Print failed'
      await enqueueFailedDocket({ orderId: job.orderId, station: job.station, errorMessage: msg })
      return NextResponse.json(
        { ok: false, error: msg },
        { status: 500 }
      )
    }
  } catch {
    return NextResponse.json({ error: 'Failed to reprint' }, { status: 500 })
  }
}
