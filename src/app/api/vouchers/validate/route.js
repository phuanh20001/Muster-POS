import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { evaluateVoucher } from '@/lib/voucher'
import { isPublicZone } from '@/lib/zone'
import { rateLimit, clientIp } from '@/lib/ratelimit'
import { resolveOnlineOrderItems, subtotalFromItems } from '@/lib/onlineOrderItems'
import { getFeatureSettings } from '@/lib/featureSettings'

export async function POST(request) {
  try {
    const { vouchersEnabled } = await getFeatureSettings()
    if (!vouchersEnabled) return NextResponse.json({ valid: false, error: 'Voucher codes are not accepted' }, { status: 200 })

    const body = await request.json()
    const code = body.code?.trim().toUpperCase()
    const rawItems = body.items ?? []
    if (!code) return NextResponse.json({ error: 'Voucher code required' }, { status: 400 })
    if (!rawItems.length) return NextResponse.json({ error: 'Items are required' }, { status: 400 })

    const ip = clientIp(request)
    const rl = rateLimit(`voucher:${ip}`, { limit: 15, windowMs: 60000 })
    if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    const codeRl = rateLimit(`voucher-code:${ip}:${code}`, { limit: 8, windowMs: 60000 })
    if (!codeRl.ok) return NextResponse.json({ error: 'Too many attempts for this code' }, { status: 429 })

    const resolved = await resolveOnlineOrderItems(rawItems)
    if (!resolved.ok) {
      return NextResponse.json({ valid: false, error: resolved.error }, { status: 400 })
    }

    const items = resolved.items
    const subtotal = subtotalFromItems(items)
    const customerId = isPublicZone(request) ? null : (
      body.customerId != null ? parseInt(body.customerId, 10) : null
    )

    const voucher = await prisma.voucher.findUnique({ where: { code } })
    const result = evaluateVoucher(
      voucher,
      subtotal,
      items,
      Number.isFinite(customerId) ? customerId : null
    )
    if (!result.ok) return NextResponse.json({ valid: false, error: result.error }, { status: 200 })

    return NextResponse.json({ valid: true, code, type: voucher.type, discount: result.discount })
  } catch {
    return NextResponse.json({ error: 'Failed to validate voucher' }, { status: 500 })
  }
}
