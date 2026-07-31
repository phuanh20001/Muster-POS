import { prisma } from '@/lib/prisma'

const DEFAULTS = {
  hoursEnabled: false,
  acceptingOrders: true,
  closedMessage: '',
}

const DEFAULT_DAY = { closed: false, openTime: '07:00', closeTime: '18:00' }

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/

export function isValidTime(value) {
  return typeof value === 'string' && HHMM.test(value)
}

// Always returns 7 entries indexed by day-of-week (0=Sun..6=Sat), so callers
// never have to handle a missing day.
function normalizeHours(rows) {
  return Array.from({ length: 7 }, (_, day) => {
    const row = rows?.find((r) => r.dayOfWeek === day)
    return {
      dayOfWeek: day,
      closed: row?.closed ?? DEFAULT_DAY.closed,
      openTime: row?.openTime ?? DEFAULT_DAY.openTime,
      closeTime: row?.closeTime ?? DEFAULT_DAY.closeTime,
    }
  })
}

export async function getOnlineOrderSettings() {
  let s = null
  let rows = null
  try {
    ;[s, rows] = await Promise.all([
      prisma.onlineOrderSettings.findUnique({ where: { id: 1 } }),
      prisma.onlineOrderHours.findMany(),
    ])
  } catch {
    // table not ready (pre-migration) — fall back to always-open defaults so a
    // missing migration can never block a paying customer.
  }
  return {
    hoursEnabled: s?.hoursEnabled ?? DEFAULTS.hoursEnabled,
    acceptingOrders: s?.acceptingOrders ?? DEFAULTS.acceptingOrders,
    closedMessage: s?.closedMessage ?? DEFAULTS.closedMessage,
    hours: normalizeHours(rows),
  }
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':')
  return Number(h) * 60 + Number(m)
}

// A closeTime <= openTime means the window wraps past midnight (e.g. 18:00–02:00).
function wraps(day) {
  return toMinutes(day.closeTime) <= toMinutes(day.openTime)
}

function withinDay(day, minutes) {
  const open = toMinutes(day.openTime)
  const close = toMinutes(day.closeTime)
  return wraps(day) ? minutes >= open || minutes < close : minutes >= open && minutes < close
}

// Exported for testing: pure given a clock reading.
export function evaluateOpen(settings, now = new Date()) {
  if (!settings.acceptingOrders) return { open: false, reason: 'PAUSED' }
  if (!settings.hoursEnabled) return { open: true, reason: null }

  const cur = now.getHours() * 60 + now.getMinutes()
  const today = settings.hours[now.getDay()]

  if (!today.closed && withinDay(today, cur)) return { open: true, reason: null }

  // A window that wrapped past midnight yesterday can still be running now
  // (e.g. Fri 18:00–02:00 means Sat 01:00 is open).
  const yesterday = settings.hours[(now.getDay() + 6) % 7]
  if (!yesterday.closed && wraps(yesterday) && cur < toMinutes(yesterday.closeTime)) {
    return { open: true, reason: null }
  }

  return { open: false, reason: today.closed ? 'CLOSED_DAY' : 'OUTSIDE_HOURS' }
}

// The next moment the shop opens, searching today then the next 7 days.
// Returns null if every day is closed (so callers can fall back to generic copy).
export function nextOpening(settings, now = new Date()) {
  const cur = now.getHours() * 60 + now.getMinutes()
  for (let offset = 0; offset <= 7; offset++) {
    const day = settings.hours[(now.getDay() + offset) % 7]
    if (day.closed) continue
    // Today only counts if opening is still ahead of us.
    if (offset === 0 && toMinutes(day.openTime) <= cur) continue
    return { dayOfWeek: day.dayOfWeek, openTime: day.openTime, daysAway: offset }
  }
  return null
}

export async function getOnlineOrderStatus(now = new Date()) {
  const settings = await getOnlineOrderSettings()
  const { open, reason } = evaluateOpen(settings, now)
  return {
    ...settings,
    open,
    reason,
    today: settings.hours[now.getDay()],
    nextOpen: open ? null : nextOpening(settings, now),
  }
}
