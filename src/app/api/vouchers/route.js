import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyAdminAccess } from '@/lib/auth'
import { parseVoucherInput } from '@/lib/voucher'
import { getFeatureSettings } from '@/lib/featureSettings'

export async function GET() {
  try {
    if (!(await verifyAdminAccess(await cookies()))) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }
    const vouchers = await prisma.voucher.findMany({
      orderBy: { createdAt: 'desc' },
      include: { customer: { select: { id: true, name: true, phone: true } } },
    })
    return NextResponse.json(vouchers)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch vouchers' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    if (!(await verifyAdminAccess(await cookies()))) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }
    const { vouchersEnabled } = await getFeatureSettings()
    if (!vouchersEnabled) {
      return NextResponse.json({ error: 'Vouchers are disabled. Enable them in Settings first.' }, { status: 400 })
    }

    const body = await request.json()
    const parsed = parseVoucherInput(body)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

    const existing = await prisma.voucher.findUnique({ where: { code: parsed.data.code } })
    if (existing) return NextResponse.json({ error: 'A voucher with that code already exists' }, { status: 409 })

    const voucher = await prisma.voucher.create({ data: parsed.data })
    return NextResponse.json(voucher, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create voucher' }, { status: 500 })
  }
}
