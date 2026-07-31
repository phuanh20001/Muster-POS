// Gives existing orders the per-day ticket numbers they were created without.
// Optional — unnumbered orders already fall back to their id in every view — but
// it makes old history read the same way as new history.
//
//   node prisma/backfill-daily-numbers.js
//
// Grouping is done in JS, not SQL: createdAt is stored in UTC, so a
// createdAt::date GROUP BY would push every order made after 10am (AEST) onto the
// wrong trading day. Numbering within a day follows id, which is creation order.
// Re-runnable: only rows still missing a number are touched, and each day resumes
// from its counter.
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

function localDayKey(date) {
  const d = new Date(date)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

async function main() {
  const orders = await prisma.order.findMany({
    where: { dailyNumber: null, status: { not: 'AWAITING_PAYMENT' } },
    select: { id: true, createdAt: true },
    orderBy: { id: 'asc' },
  })

  if (orders.length === 0) {
    console.log('Nothing to backfill — every order already has a ticket number.')
    return
  }

  const byDay = new Map()
  for (const order of orders) {
    const key = localDayKey(order.createdAt)
    if (!byDay.has(key)) byDay.set(key, [])
    byDay.get(key).push(order)
  }

  let numbered = 0
  for (const [businessDate, dayOrders] of byDay) {
    // Resume from the counter so a half-finished run (or a day that already has
    // live orders on it) can't hand out a number twice.
    const counter = await prisma.orderDayCounter.findUnique({ where: { businessDate } })
    let next = (counter?.lastNumber ?? 0) + 1

    for (const order of dayOrders) {
      await prisma.order.update({
        where: { id: order.id },
        data: { businessDate, dailyNumber: next },
      })
      next += 1
      numbered += 1
    }

    await prisma.orderDayCounter.upsert({
      where: { businessDate },
      update: { lastNumber: next - 1 },
      create: { businessDate, lastNumber: next - 1 },
    })
    console.log(`${businessDate}: numbered ${dayOrders.length} order(s), counter now at ${next - 1}`)
  }

  console.log(`Done — ${numbered} order(s) across ${byDay.size} day(s).`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
