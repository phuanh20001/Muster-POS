import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyAdminAccess } from '@/lib/auth'
import { getFeatureSettings } from '@/lib/featureSettings'

export async function GET() {
  try {
    const settings = await getFeatureSettings()
    return NextResponse.json(settings)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch feature settings' }, { status: 500 })
  }
}

export async function PATCH(request) {
  try {
    const cookieStore = await cookies()
    if (!(await verifyAdminAccess(cookieStore))) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const data = {}
    if ('expensesEnabled' in body) data.expensesEnabled = Boolean(body.expensesEnabled)
    if ('purchasingEnabled' in body) data.purchasingEnabled = Boolean(body.purchasingEnabled)
    if ('productImagesEnabled' in body) data.productImagesEnabled = Boolean(body.productImagesEnabled)
    if ('vouchersEnabled' in body) data.vouchersEnabled = Boolean(body.vouchersEnabled)
    if ('manualTableNumbers' in body) data.manualTableNumbers = Boolean(body.manualTableNumbers)
    if ('tableNumberMax' in body) {
      const max = parseInt(body.tableNumberMax)
      if (!Number.isInteger(max) || max < 1 || max > 99) {
        return NextResponse.json({ error: 'Table number quick picks must be between 1 and 99' }, { status: 400 })
      }
      data.tableNumberMax = max
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No valid settings provided' }, { status: 400 })
    }

    const settings = await prisma.featureSettings.upsert({
      where: { id: 1 },
      update: data,
      create: { id: 1, ...data },
    })

    return NextResponse.json({
      expensesEnabled: settings.expensesEnabled,
      purchasingEnabled: settings.purchasingEnabled,
      productImagesEnabled: settings.productImagesEnabled,
      vouchersEnabled: settings.vouchersEnabled,
      manualTableNumbers: settings.manualTableNumbers,
      tableNumberMax: settings.tableNumberMax,
    })
  } catch {
    return NextResponse.json({ error: 'Failed to update feature settings' }, { status: 500 })
  }
}
