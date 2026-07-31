import { prisma } from '@/lib/prisma'
import { orderLocationLabel, orderTicketWithId } from '@/lib/formatters'

export function stationLabel(station) {
  if (station === 'KITCHEN') return 'Kitchen'
  return 'Front'
}

export async function enqueueFailedDocket({ orderId, station, errorMessage }) {
  try {
    await prisma.printJob.upsert({
      where: { orderId_station: { orderId, station } },
      update: { status: 'FAILED', errorMessage: errorMessage || 'Print failed' },
      create: {
        orderId,
        station,
        status: 'FAILED',
        errorMessage: errorMessage || 'Print failed',
      },
    })
  } catch (err) {
    console.error('[print-queue] enqueue error:', err.message)
  }
}

export async function clearFailedDocket({ orderId, station }) {
  try {
    await prisma.printJob.deleteMany({ where: { orderId, station } })
  } catch (err) {
    console.error('[print-queue] clear error:', err.message)
  }
}

export async function listFailedDockets() {
  try {
    const jobs = await prisma.printJob.findMany({
      where: { status: 'FAILED' },
      orderBy: { updatedAt: 'desc' },
      include: { order: { select: { id: true, dailyNumber: true, tableId: true, tableNumber: true, tableManual: true, source: true } } },
    })
    return jobs.map((job) => ({
      id: job.id,
      orderId: job.orderId,
      // Failed jobs sit in the queue across days until reprinted or dismissed, so
      // the ticket number alone would be ambiguous here — carry the id with it.
      ticketLabel: orderTicketWithId(job.order),
      locationLabel: orderLocationLabel(job.order),
      station: job.station,
      stationLabel: stationLabel(job.station),
      status: job.status,
      errorMessage: job.errorMessage,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    }))
  } catch {
    return []
  }
}

export async function dismissPrintJob(id) {
  await prisma.printJob.delete({ where: { id: parseInt(id) } })
}

export async function getPrintJob(id) {
  return prisma.printJob.findUnique({
    where: { id: parseInt(id) },
    include: {
      order: {
        include: {
          items: { include: { product: true, modifiers: true } },
          table: true,
          user: { select: { id: true, name: true } },
        },
      },
    },
  })
}
