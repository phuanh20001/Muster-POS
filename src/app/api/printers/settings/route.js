import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyAdminAccess } from '@/lib/auth'

export async function PATCH(request) {
  try {
    const cookieStore = await cookies()
    const payload = await verifyAdminAccess(cookieStore)
    if (!payload) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const data = {}
    if (body.autoPrintCardReceipts !== undefined) {
      if (typeof body.autoPrintCardReceipts !== 'boolean') {
        return NextResponse.json({ error: 'autoPrintCardReceipts must be a boolean' }, { status: 400 })
      }
      data.autoPrintCardReceipts = body.autoPrintCardReceipts
    }
    if (body.autoPrintDockets !== undefined) {
      if (typeof body.autoPrintDockets !== 'boolean') {
        return NextResponse.json({ error: 'autoPrintDockets must be a boolean' }, { status: 400 })
      }
      data.autoPrintDockets = body.autoPrintDockets
    }
    if (body.autoOpenDrawer !== undefined) {
      if (typeof body.autoOpenDrawer !== 'boolean') {
        return NextResponse.json({ error: 'autoOpenDrawer must be a boolean' }, { status: 400 })
      }
      data.autoOpenDrawer = body.autoOpenDrawer
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No settings to update' }, { status: 400 })
    }

    const front = await prisma.printerConfig.upsert({
      where: { name: 'FRONT' },
      update: data,
      create: { name: 'FRONT', ...data },
    })

    return NextResponse.json({
      autoPrintCardReceipts: front.autoPrintCardReceipts,
      autoPrintDockets: front.autoPrintDockets,
      autoOpenDrawer: front.autoOpenDrawer,
    })
  } catch {
    return NextResponse.json({ error: 'Failed to update printer settings' }, { status: 500 })
  }
}
