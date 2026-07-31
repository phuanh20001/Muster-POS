import { NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyUsersPanelAccess, verifyAdminAccess } from '@/lib/auth'

export async function GET() {
  try {
    if (!await verifyUsersPanelAccess(await cookies())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const users = await prisma.user.findMany({
      select: { id: true, name: true, username: true, role: true, status: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    })
    return NextResponse.json(users)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const requester = await verifyUsersPanelAccess(await cookies())
    if (!requester) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { name, username, password, role, pin } = await request.json()
    if (!name || !username || !password) return NextResponse.json({ error: 'name, username and password are required' }, { status: 400 })

    const isAdmin = requester.role === 'ADMIN'
    const allowedRoles = isAdmin ? ['STAFF', 'MANAGER', 'ADMIN'] : ['STAFF', 'MANAGER']
    if (role && !allowedRoles.includes(role)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 })

    const hashed = await hash(password, 10)
    const data = {
      name,
      username,
      password: hashed,
      role: role ?? 'STAFF',
      status: isAdmin ? 'ACTIVE' : 'PENDING',
    }
    if (pin) data.pin = await hash(String(pin), 10)

    const user = await prisma.user.create({
      data,
      select: { id: true, name: true, username: true, role: true, status: true, createdAt: true },
    })
    return NextResponse.json(user, { status: 201 })
  } catch (e) {
    if (e.code === 'P2002') return NextResponse.json({ error: 'Username already taken' }, { status: 409 })
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
  }
}
