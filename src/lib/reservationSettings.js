import { prisma } from '@/lib/prisma'

export const DEFAULT_REMINDER_LEAD_MINUTES = 120
export const MIN_REMINDER_LEAD_MINUTES = 5
export const MAX_REMINDER_LEAD_MINUTES = 1440

export async function getReservationSettings() {
  let settings = null
  try {
    settings = await prisma.reservationSettings.findUnique({ where: { id: 1 } })
  } catch {
    // table not ready (pre-migration) — fall back to defaults
  }
  return {
    reminderLeadMinutes: settings?.reminderLeadMinutes ?? DEFAULT_REMINDER_LEAD_MINUTES,
  }
}
