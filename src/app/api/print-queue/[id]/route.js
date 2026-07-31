import { NextResponse } from 'next/server'
import { dismissPrintJob } from '@/lib/printQueue'

export async function DELETE(request, { params }) {
  try {
    const { id } = await params
    await dismissPrintJob(id)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to dismiss print job' }, { status: 500 })
  }
}
