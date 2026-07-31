import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyAdminAccess } from '@/lib/auth'
import { parseReportDateRange } from '@/lib/accounting'
import { D, mul, sum, toDb, gt } from '@/lib/money'

export async function GET(request) {
  try {
    const cookieStore = await cookies()
    if (!(await verifyAdminAccess(cookieStore))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const { from, to, start, end } = parseReportDateRange(searchParams)

    const receivings = await prisma.stockReceiving.findMany({
      where: { receivedAt: { gte: start, lte: end } },
      include: { supplier: { select: { id: true, name: true } }, lines: true },
      orderBy: { receivedAt: 'desc' },
    })

    return NextResponse.json({ from, to, receivings })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch receivings' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const cookieStore = await cookies()
    const session = await verifyAdminAccess(cookieStore)
    if (!session) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const rawLines = Array.isArray(body.lines) ? body.lines : []
    const lines = rawLines
      .map((l) => ({
        stockItemId: l.stockItemId ? parseInt(l.stockItemId) : null,
        name: (l.name ?? '').trim(),
        quantity: parseInt(l.quantity),
        unitCost: D(l.unitCost),
      }))
      .filter((l) => l.name && Number.isFinite(l.quantity) && l.quantity > 0)

    if (lines.length === 0) {
      return NextResponse.json({ error: 'At least one valid line is required' }, { status: 400 })
    }

    const linesData = lines.map((l) => ({
      stockItemId: l.stockItemId,
      name: l.name,
      quantity: l.quantity,
      unitCost: toDb(l.unitCost),
      lineCost: toDb(mul(l.unitCost, l.quantity)),
    }))
    const totalCost = sum(linesData, (l) => l.lineCost)

    const receiving = await prisma.$transaction(async (tx) => {
      const created = await tx.stockReceiving.create({
        data: {
          supplierId: body.supplierId ? parseInt(body.supplierId) : null,
          receivedAt: body.receivedAt ? new Date(body.receivedAt) : new Date(),
          note: (body.note ?? '').trim(),
          totalCost: toDb(totalCost),
          userId: session.id ?? null,
          lines: { create: linesData },
        },
        include: { supplier: { select: { id: true, name: true } }, lines: true },
      })

      // Atomic bump: COALESCE treats a never-counted (null) quantity as 0 so the
      // first receiving sets it and later ones increment — in a single DB write,
      // not a read-then-set, so two receivings for the same new item can't lose
      // one's units to a lost update. A non-existent id updates 0 rows (no-op).
      for (const line of lines) {
        if (!line.stockItemId) continue
        await tx.$executeRaw`
          UPDATE "StockItem"
          SET "quantity" = COALESCE("quantity", 0) + ${line.quantity}
          WHERE id = ${line.stockItemId}
        `
      }

      return created
    })

    return NextResponse.json(receiving, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create receiving' }, { status: 500 })
  }
}
