import { prisma } from '@/lib/prisma'

// Grouped tables share occupancy (one party across pushed-together tables), so
// any status change to a member applies to the whole group. Always use this
// instead of updating Table.status directly.
export async function setTableStatus(tableId, status) {
  const table = await prisma.table.findUnique({ where: { id: tableId } })
  if (!table) return
  if (table.groupId) {
    await prisma.table.updateMany({ where: { groupId: table.groupId }, data: { status } })
  } else {
    await prisma.table.update({ where: { id: tableId }, data: { status } })
  }
}
