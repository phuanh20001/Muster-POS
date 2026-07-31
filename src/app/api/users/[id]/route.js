import { NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyUsersPanelAccess, verifyAdminAccess } from '@/lib/auth'

export async function PATCH(request, { params }) {
  try {
    const { id } = await params
    const requester = await verifyUsersPanelAccess(await cookies())
    if (!requester) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const isAdmin = requester.role === 'ADMIN'
    const { name, username, password, role, pin, status } = await request.json()

    const allowedRoles = isAdmin ? ['STAFF', 'MANAGER', 'ADMIN'] : ['STAFF', 'MANAGER']
    if (role && !allowedRoles.includes(role)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    if (status && !isAdmin) return NextResponse.json({ error: 'Admin access required to change status' }, { status: 403 })
    if (status && !['ACTIVE', 'PENDING'].includes(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })

    const data = {}
    if (name) data.name = name
    if (username) data.username = username
    if (role) data.role = role
    if (status && isAdmin) data.status = status
    if (password) data.password = await hash(password, 10)
    if (pin !== undefined) data.pin = pin ? await hash(String(pin), 10) : null

    const user = await prisma.user.update({
      where: { id: parseInt(id) },
      data,
      select: { id: true, name: true, username: true, role: true, status: true, createdAt: true },
    })
    return NextResponse.json(user)
  } catch (e) {
    if (e.code === 'P2002') return NextResponse.json({ error: 'Username already taken' }, { status: 409 })
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params
    const requester = await verifyAdminAccess(await cookies())
    if (!requester) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (requester.role !== 'ADMIN') return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    if (Number(requester.id) === parseInt(id)) return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })
    await prisma.user.delete({ where: { id: parseInt(id) } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 })
  }
}
