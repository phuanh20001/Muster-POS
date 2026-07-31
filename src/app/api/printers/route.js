import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const printers = await prisma.printerConfig.findMany({ orderBy: { id: 'asc' } })
    const front = printers.find((p) => p.name === 'FRONT')
    return NextResponse.json({
      printers,
      autoPrintCardReceipts: front?.autoPrintCardReceipts ?? true,
      autoPrintDockets: front?.autoPrintDockets ?? true,
      autoOpenDrawer: front?.autoOpenDrawer ?? true,
    })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch printers' }, { status: 500 })
  }
}
