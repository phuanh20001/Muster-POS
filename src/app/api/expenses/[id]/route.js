import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyAdminAccess } from '@/lib/auth'
import { D, toDb, gt } from '@/lib/money'

export async function PATCH(request, { params }) {
  try {
    const cookieStore = await cookies()
    if (!(await verifyAdminAccess(cookieStore))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()
    const data = {}

    if ('amount' in body) {
      if (!gt(D(body.amount), 0)) {
        return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
      }
      data.amount = toDb(body.amount)
    }
    if ('category' in body) {
      const category = (body.category ?? '').trim()
      if (!category) return NextResponse.json({ error: 'Category is required' }, { status: 400 })
      data.category = category
    }
    if ('note' in body) data.note = (body.note ?? '').trim()
    if ('spentAt' in body) data.spentAt = new Date(body.spentAt)
    if ('supplierId' in body) data.supplierId = body.supplierId ? parseInt(body.supplierId) : null

    const expense = await prisma.expense.update({
      where: { id: parseInt(id) },
      data,
      include: { supplier: { select: { id: true, name: true } } },
    })

    return NextResponse.json(expense)
  } catch {
    return NextResponse.json({ error: 'Failed to update expense' }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  try {
    const cookieStore = await cookies()
    if (!(await verifyAdminAccess(cookieStore))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    await prisma.expense.delete({ where: { id: parseInt(id) } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete expense' }, { status: 500 })
  }
}
