import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyAdminAccess } from '@/lib/auth'

export async function DELETE(request, { params }) {
  try {
    const cookieStore = await cookies()
    if (!(await verifyAdminAccess(cookieStore))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const receivingId = parseInt(id)

    await prisma.$transaction(async (tx) => {
      const receiving = await tx.stockReceiving.findUnique({
        where: { id: receivingId },
        include: { lines: true },
      })
      if (!receiving) return

      // Reverse the stock bumps from this receiving with a floored atomic update
      // (GREATEST clamps at 0). IS NOT NULL leaves a never-counted item untouched
      // rather than materialising a 0. Atomic so it can't lose-update against a
      // concurrent receiving/reversal on the same item.
      for (const line of receiving.lines) {
        if (!line.stockItemId) continue
        await tx.$executeRaw`
          UPDATE "StockItem"
          SET "quantity" = GREATEST("quantity" - ${line.quantity}, 0)
          WHERE id = ${line.stockItemId} AND "quantity" IS NOT NULL
        `
      }

      await tx.stockReceiving.delete({ where: { id: receivingId } })
    })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete receiving' }, { status: 500 })
  }
}
