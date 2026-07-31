import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyManagerAccess } from '@/lib/auth'
import { setTableStatus } from '@/lib/tables'

export async function PATCH(request, { params }) {
  try {
    const { id } = await params
    const tableId = parseInt(id)
    const body = await request.json()

    // Status changes go through the group-aware helper (shared occupancy).
    if (body.status !== undefined) {
      await setTableStatus(tableId, body.status)
    }

    const data = {}
    if (body.x !== undefined) data.x = body.x
    if (body.y !== undefined) data.y = body.y
    if (body.label !== undefined) data.label = body.label

    const table = Object.keys(data).length
      ? await prisma.table.update({ where: { id: tableId }, data })
      : await prisma.table.findUnique({ where: { id: tableId } })

    return NextResponse.json(table)
  } catch {
    return NextResponse.json({ error: 'Failed to update table' }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  try {
    if (!(await verifyManagerAccess(await cookies()))) {
      return NextResponse.json({ error: 'Manager access required to delete tables' }, { status: 403 })
    }

    const { id } = await params
    const table = await prisma.table.findUnique({ where: { id: parseInt(id) } })
    if (table?.status === 'OCCUPIED') return NextResponse.json({ error: 'Cannot delete an occupied table' }, { status: 400 })

    await prisma.table.delete({ where: { id: parseInt(id) } })

    // A group of one is no group — clean up the remaining member.
    if (table?.groupId) {
      const remaining = await prisma.table.findMany({ where: { groupId: table.groupId } })
      if (remaining.length <= 1) {
        await prisma.table.updateMany({ where: { groupId: table.groupId }, data: { groupId: null } })
      }
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete table' }, { status: 500 })
  }
}
