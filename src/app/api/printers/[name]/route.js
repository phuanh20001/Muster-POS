import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyAdminAccess } from '@/lib/auth'
import { cookies } from 'next/headers'
import { normalizePaperWidth, normalizePrinterType } from '@/lib/printerTypes'

export async function PUT(request, { params }) {
  try {
    const cookieStore = await cookies()
    const admin = await verifyAdminAccess(cookieStore)
    if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

    const { name } = await params
    const body = await request.json()

    const printer = await prisma.printerConfig.upsert({
      where: { name },
      update: {
        ...(body.description !== undefined && { description: body.description }),
        ...(body.ip !== undefined && { ip: body.ip }),
        ...(body.port !== undefined && { port: parseInt(body.port) }),
        ...(body.printReceipts !== undefined && { printReceipts: body.printReceipts }),
        ...(body.openDrawer !== undefined && { openDrawer: body.openDrawer }),
        ...(body.printDockets !== undefined && { printDockets: body.printDockets }),
        ...(body.enabled !== undefined && { enabled: body.enabled }),
        ...(body.printerType !== undefined && { printerType: normalizePrinterType(body.printerType) }),
        ...(body.paperWidth !== undefined && { paperWidth: normalizePaperWidth(body.paperWidth) }),
      },
      create: {
        name,
        description: body.description ?? '',
        ip: body.ip ?? '',
        port: parseInt(body.port ?? 9100),
        printerType: normalizePrinterType(body.printerType),
        paperWidth: normalizePaperWidth(body.paperWidth),
        printReceipts: body.printReceipts ?? true,
        openDrawer: body.openDrawer ?? false,
        printDockets: body.printDockets ?? true,
        enabled: body.enabled ?? true,
      },
    })
    return NextResponse.json(printer)
  } catch {
    return NextResponse.json({ error: 'Failed to update printer' }, { status: 500 })
  }
}
