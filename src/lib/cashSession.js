import { prisma } from '@/lib/prisma'
import { D, sum } from '@/lib/money'

export async function computeExpectedCash(session, movements) {
  const cashSales = await prisma.order.aggregate({
    where: {
      createdAt: {
        gte: session.openedAt,
        ...(session.closedAt ? { lte: session.closedAt } : {}),
      },
      cashAmount: { gt: 0 },
      // REFUNDED cash stays in the sum — the refund's OUT movement nets it out;
      // excluding it here too would double-deduct (see AGENTS.md).
      status: { in: ['COMPLETED', 'REFUNDED'] },
    },
    _sum: { cashAmount: true },
  })

  const rows = movements ?? await prisma.cashMovement.findMany({
    where: { cashSessionId: session.id },
  })
  const totalIn = sum(rows.filter((m) => m.type === 'IN'), (m) => m.amount)
  const totalOut = sum(rows.filter((m) => m.type === 'OUT'), (m) => m.amount)
  return D(session.openingFloat)
    .plus(D(cashSales._sum.cashAmount ?? 0))
    .plus(totalIn)
    .minus(totalOut)
}
