import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyAdminAccess } from '@/lib/auth'
import { parseVoucherInput } from '@/lib/voucher'

export async function PATCH(request, { params }) {
  try {
    if (!(await verifyAdminAccess(await cookies()))) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }
    const { id } = await params
    const voucherId = parseInt(id, 10)
    if (!Number.isFinite(voucherId)) return NextResponse.json({ error: 'Invalid voucher' }, { status: 400 })

    const body = await request.json()
    const parsed = parseVoucherInput(body, { partial: true })
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

    // timesUsed is derived from real redemptions — never hand-editable.
    if (parsed.data.code) {
      const clash = await prisma.voucher.findFirst({
        where: { code: parsed.data.code, id: { not: voucherId } },
      })
      if (clash) return NextResponse.json({ error: 'A voucher with that code already exists' }, { status: 409 })
    }

    const voucher = await prisma.voucher.update({ where: { id: voucherId }, data: parsed.data })
    return NextResponse.json(voucher)
  } catch {
    return NextResponse.json({ error: 'Failed to update voucher' }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  try {
    if (!(await verifyAdminAccess(await cookies()))) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }
    const { id } = await params
    const voucherId = parseInt(id, 10)
    if (!Number.isFinite(voucherId)) return NextResponse.json({ error: 'Invalid voucher' }, { status: 400 })

    // Order.voucherId is onDelete: SetNull, so deleting keeps past orders intact.
    await prisma.voucher.delete({ where: { id: voucherId } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete voucher' }, { status: 500 })
  }
}
