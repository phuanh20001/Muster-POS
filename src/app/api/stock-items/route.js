import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyAdminAccess } from '@/lib/auth'

export async function GET() {
  try {
    const items = await prisma.stockItem.findMany({ orderBy: { name: 'asc' } })
    return NextResponse.json(items)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch stock items' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const payload = await verifyAdminAccess(await cookies())
    if (!payload) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const { name, unit, quantity, lowStockThreshold } = body
    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }
    const item = await prisma.stockItem.create({
      data: {
        name: name.trim(),
        unit: unit?.trim() || 'units',
        quantity: quantity !== undefined && quantity !== '' ? parseInt(quantity) : null,
        lowStockThreshold: lowStockThreshold !== undefined && lowStockThreshold !== '' ? parseInt(lowStockThreshold) : 5,
      },
    })
    return NextResponse.json(item, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create stock item' }, { status: 500 })
  }
}
