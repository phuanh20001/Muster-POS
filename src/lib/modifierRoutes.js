import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyManagerAccess } from '@/lib/auth'
import { toDb } from '@/lib/money'

export function createModifierCollectionHandlers(model, parentIdField) {
  return {
    async GET(request, { params }) {
      try {
        const { id } = await params
        const modifiers = await prisma[model].findMany({
          where: { [parentIdField]: parseInt(id) },
          orderBy: { id: 'asc' },
        })
        return NextResponse.json(modifiers)
      } catch {
        return NextResponse.json({ error: 'Failed to fetch modifiers' }, { status: 500 })
      }
    },

    async POST(request, { params }) {
      try {
        const manager = await verifyManagerAccess(await cookies())
        if (!manager) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

        const { id } = await params
        const body = await request.json()
        const modifier = await prisma[model].create({
          data: {
            [parentIdField]: parseInt(id),
            name: body.name,
            price: toDb(body.price),
            available: body.available ?? true,
          },
        })
        return NextResponse.json(modifier, { status: 201 })
      } catch {
        return NextResponse.json({ error: 'Failed to create modifier' }, { status: 500 })
      }
    },
  }
}

export function createModifierItemHandlers(model) {
  return {
    async PUT(request, { params }) {
      try {
        const manager = await verifyManagerAccess(await cookies())
        if (!manager) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

        const { modId } = await params
        const body = await request.json()
        const modifier = await prisma[model].update({
          where: { id: parseInt(modId) },
          data: {
            ...(body.name !== undefined && { name: body.name }),
            ...(body.price !== undefined && { price: toDb(body.price) }),
            ...(body.available !== undefined && { available: body.available }),
          },
        })
        return NextResponse.json(modifier)
      } catch {
        return NextResponse.json({ error: 'Failed to update modifier' }, { status: 500 })
      }
    },

    async DELETE(request, { params }) {
      try {
        const manager = await verifyManagerAccess(await cookies())
        if (!manager) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

        const { modId } = await params
        await prisma[model].delete({ where: { id: parseInt(modId) } })
        return NextResponse.json({ success: true })
      } catch {
        return NextResponse.json({ error: 'Failed to delete modifier' }, { status: 500 })
      }
    },
  }
}
