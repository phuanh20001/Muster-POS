import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const tables = await prisma.table.findMany({
      orderBy: { number: 'asc' },
      include: {
        orders: {
          where: {
            status: { not: 'CANCELLED' },
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
          include: {
            items: { include: { product: true } },
            user: { select: { name: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    })
    return NextResponse.json(tables)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch tables' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const body = await request.json()
    const table = await prisma.table.create({
      data: {
        number: body.number,
        label: body.label ?? '',
        x: body.x ?? 100,
        y: body.y ?? 100,
      },
    })
    return NextResponse.json(table, { status: 201 })
  } catch (e) {
    if (e.code === 'P2002') return NextResponse.json({ error: 'Table number already exists' }, { status: 409 })
    return NextResponse.json({ error: 'Failed to create table' }, { status: 500 })
  }
}
