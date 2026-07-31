import { prisma } from '@/lib/prisma'

export async function getShiftSettings() {
  let settings = null
  try {
    settings = await prisma.shiftSettings.findUnique({ where: { id: 1 } })
  } catch {
    // table not ready (pre-migration) — fall back to defaults
  }
  return {
    shiftRoutineEnabled: settings?.shiftRoutineEnabled ?? true,
  }
}
