import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyAdminAccess, verifyAdminOrManagerAccess } from '@/lib/auth'

export async function PATCH(request, { params }) {
  try {
    const payload = await verifyAdminOrManagerAccess(await cookies())
    if (!payload) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
    const { id } = await params
    const body = await request.json()
    const data = {}
    if ('name' in body && body.name?.trim()) data.name = body.name.trim()
    if ('unit' in body) data.unit = body.unit?.trim() || 'units'
    if ('quantity' in body) data.quantity = body.quantity === '' || body.quantity === null ? null : parseInt(body.quantity)
    if ('lowStockThreshold' in body && body.lowStockThreshold !== '') data.lowStockThreshold = parseInt(body.lowStockThreshold)
    const item = await prisma.stockItem.update({ where: { id: parseInt(id) }, data })
    return NextResponse.json(item)
  } catch {
    return NextResponse.json({ error: 'Failed to update stock item' }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  try {
    const payload = await verifyAdminAccess(await cookies())
    if (!payload) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }
    const { id } = await params
    await prisma.stockItem.delete({ where: { id: parseInt(id) } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete stock item' }, { status: 500 })
  }
}
