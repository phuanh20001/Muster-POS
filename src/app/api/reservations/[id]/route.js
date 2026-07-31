import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyManagerAccess } from '@/lib/auth'

export async function PATCH(request, { params }) {
  try {
    const { id } = await params
    const body = await request.json()
    const { name, phone, scheduledAt, partySize, note, status } = body

    const data = {}
    if (name !== undefined) data.name = name.trim()
    if (phone !== undefined) data.phone = phone?.trim() || null
    if (scheduledAt !== undefined) data.scheduledAt = new Date(scheduledAt)
    if (partySize !== undefined) data.partySize = parseInt(partySize)
    if (note !== undefined) data.note = note?.trim() || null
    if (status !== undefined) data.status = status

    const reservation = await prisma.reservation.update({
      where: { id: parseInt(id) },
      data,
    })

    return NextResponse.json(reservation)
  } catch {
    return NextResponse.json({ error: 'Failed to update reservation' }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  try {
    const payload = await verifyManagerAccess(await cookies())
    if (!payload) {
      return NextResponse.json({ error: 'Manager access required' }, { status: 403 })
    }

    const { id } = await params
    await prisma.reservation.delete({ where: { id: parseInt(id) } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete reservation' }, { status: 500 })
  }
}
