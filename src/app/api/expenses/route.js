import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyAdminAccess } from '@/lib/auth'
import { parseReportDateRange } from '@/lib/accounting'
import { D, toDb, gt } from '@/lib/money'

export async function GET(request) {
  try {
    const cookieStore = await cookies()
    if (!(await verifyAdminAccess(cookieStore))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const { from, to, start, end } = parseReportDateRange(searchParams)

    const expenses = await prisma.expense.findMany({
      where: { spentAt: { gte: start, lte: end } },
      include: { supplier: { select: { id: true, name: true } } },
      orderBy: { spentAt: 'desc' },
    })

    return NextResponse.json({ from, to, expenses })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch expenses' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const cookieStore = await cookies()
    if (!(await verifyAdminAccess(cookieStore))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const category = (body.category ?? '').trim()
    if (!category) {
      return NextResponse.json({ error: 'Category is required' }, { status: 400 })
    }
    if (!gt(D(body.amount), 0)) {
      return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
    }

    const expense = await prisma.expense.create({
      data: {
        amount: toDb(body.amount),
        category,
        note: (body.note ?? '').trim(),
        spentAt: body.spentAt ? new Date(body.spentAt) : new Date(),
        supplierId: body.supplierId ? parseInt(body.supplierId) : null,
      },
      include: { supplier: { select: { id: true, name: true } } },
    })

    return NextResponse.json(expense, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create expense' }, { status: 500 })
  }
}
