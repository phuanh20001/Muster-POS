import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Group tables together (shared movement + occupancy). If any of the tables is
// already in a group, the others join that group; otherwise a new group is made.
export async function POST(request) {
  try {
    const body = await request.json()
    const tableIds = (body.tableIds ?? []).map((n) => parseInt(n)).filter(Boolean)
    if (tableIds.length < 2) {
      return NextResponse.json({ error: 'At least two tables are required' }, { status: 400 })
    }

    const tables = await prisma.table.findMany({ where: { id: { in: tableIds } } })
    if (tables.length !== tableIds.length) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 })
    }

    const groupId = tables.find((t) => t.groupId)?.groupId ?? crypto.randomUUID()

    // Collect existing members of any group being merged in, so groups combine cleanly.
    const existingGroupIds = [...new Set(tables.map((t) => t.groupId).filter(Boolean))]
    await prisma.table.updateMany({
      where: { OR: [{ id: { in: tableIds } }, { groupId: { in: existingGroupIds } }] },
      data: { groupId },
    })

    // One party per group: if any member is occupied, the whole group is.
    const members = await prisma.table.findMany({ where: { groupId } })
    if (members.some((t) => t.status === 'OCCUPIED')) {
      await prisma.table.updateMany({ where: { groupId }, data: { status: 'OCCUPIED' } })
    }

    return NextResponse.json({ groupId })
  } catch {
    return NextResponse.json({ error: 'Failed to group tables' }, { status: 500 })
  }
}

export async function DELETE(request) {
  try {
    const body = await request.json()
    if (!body.groupId) return NextResponse.json({ error: 'groupId required' }, { status: 400 })
    await prisma.table.updateMany({ where: { groupId: body.groupId }, data: { groupId: null } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to ungroup tables' }, { status: 500 })
  }
}
