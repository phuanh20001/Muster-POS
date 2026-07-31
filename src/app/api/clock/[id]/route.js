import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyClockEditorAccess, canEditClockTarget } from '@/lib/auth'
import { isHalfHourDate } from '@/lib/clockTime'

export async function PATCH(request, { params }) {
  try {
    const editor = await verifyClockEditorAccess(await cookies())
    if (!editor) {
      return NextResponse.json({ error: 'Manager or admin session required' }, { status: 401 })
    }

    const { id } = await params
    const existing = await prisma.clockRecord.findUnique({
      where: { id: parseInt(id) },
      include: { user: { select: { role: true } } },
    })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!canEditClockTarget(editor.role, existing.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { timestamp } = await request.json()
    if (!timestamp) return NextResponse.json({ error: 'timestamp is required' }, { status: 400 })

    const ts = new Date(timestamp)
    if (!isHalfHourDate(ts)) {
      return NextResponse.json({ error: 'Time must be on the hour or half-hour' }, { status: 400 })
    }

    const record = await prisma.clockRecord.update({
      where: { id: parseInt(id) },
      data: { timestamp: new Date(timestamp) },
      include: { user: { select: { id: true, name: true, role: true } } },
    })

    return NextResponse.json(record)
  } catch {
    return NextResponse.json({ error: 'Failed to update clock record' }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  try {
    const editor = await verifyClockEditorAccess(await cookies())
    if (!editor) {
      return NextResponse.json({ error: 'Manager or admin session required' }, { status: 401 })
    }

    const { id } = await params
    const existing = await prisma.clockRecord.findUnique({
      where: { id: parseInt(id) },
      include: { user: { select: { role: true } } },
    })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!canEditClockTarget(editor.role, existing.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await prisma.clockRecord.delete({ where: { id: parseInt(id) } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete clock record' }, { status: 500 })
  }
}
