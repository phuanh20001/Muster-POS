import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyAdminAccess } from '@/lib/auth'

export async function PATCH(request, { params }) {
  try {
    const cookieStore = await cookies()
    if (!(await verifyAdminAccess(cookieStore))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const { id } = await params
    const body = await request.json()
    const data = {}
    if ('name' in body) {
      const name = (body.name ?? '').trim()
      if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
      data.name = name
    }
    if ('contact' in body) data.contact = (body.contact ?? '').trim()
    if ('note' in body) data.note = (body.note ?? '').trim()

    const supplier = await prisma.supplier.update({ where: { id: parseInt(id) }, data })
    return NextResponse.json(supplier)
  } catch {
    return NextResponse.json({ error: 'Failed to update supplier' }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  try {
    const cookieStore = await cookies()
    if (!(await verifyAdminAccess(cookieStore))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const { id } = await params
    await prisma.supplier.delete({ where: { id: parseInt(id) } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete supplier' }, { status: 500 })
  }
}
