import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const sessions = await prisma.cashSession.findMany({
      where: { closedAt: { not: null } },
      orderBy: { openedAt: 'desc' },
      take: 14,
    })
    return NextResponse.json(sessions)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 })
  }
}
