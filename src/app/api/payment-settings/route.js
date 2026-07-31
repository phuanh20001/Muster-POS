import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyAdminAccess } from '@/lib/auth'
import { getPaymentSettings, CARD_BRANDS } from '@/lib/paymentSettings'
import { toDb } from '@/lib/money'
import { clampTerminalWait } from '@/lib/terminalDeadline'

export async function GET() {
  try {
    const settings = await getPaymentSettings()
    return NextResponse.json(settings)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch payment settings' }, { status: 500 })
  }
}

export async function PATCH(request) {
  try {
    const cookieStore = await cookies()
    const payload = await verifyAdminAccess(cookieStore)
    if (!payload) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const type = body.cardSurchargeType === 'PERCENT' || body.cardSurchargeType === 'FIXED'
      ? body.cardSurchargeType
      : ''
    const value = Math.max(0, parseFloat(body.cardSurchargeValue) || 0)
    const validKeys = CARD_BRANDS.map((b) => b.key)
    const blockedBrands = Array.isArray(body.blockedBrands)
      ? body.blockedBrands.filter((k) => validKeys.includes(k))
      : []

    const data = {
      cardSurchargeType: value > 0 ? type : '',
      cardSurchargeValue: toDb(type ? value : 0),
      blockedBrands,
    }
    if (body.provider === 'STRIPE' || body.provider === 'SQUARE') {
      data.provider = body.provider
    }
    if (body.onlineProvider === 'STRIPE' || body.onlineProvider === 'SQUARE') {
      data.onlineProvider = body.onlineProvider
    }
    if (body.terminalWaitSeconds != null) {
      data.terminalWaitSeconds = clampTerminalWait(body.terminalWaitSeconds)
    }

    const settings = await prisma.paymentSettings.upsert({
      where: { id: 1 },
      update: data,
      create: { id: 1, ...data },
    })

    return NextResponse.json({
      cardSurchargeType: settings.cardSurchargeType,
      cardSurchargeValue: settings.cardSurchargeValue,
      blockedBrands: settings.blockedBrands,
      provider: settings.provider,
      onlineProvider: settings.onlineProvider,
      terminalWaitSeconds: settings.terminalWaitSeconds,
    })
  } catch {
    return NextResponse.json({ error: 'Failed to update payment settings' }, { status: 500 })
  }
}
