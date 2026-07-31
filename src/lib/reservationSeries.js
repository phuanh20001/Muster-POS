import { prisma } from '@/lib/prisma'
import { generateOccurrenceDates } from '@/lib/recurrence'

const HORIZON_WEEKS = 16
const BUFFER_WEEKS = 4

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function startOfDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function addWeeks(date, weeks) {
  const d = startOfDay(date)
  d.setDate(d.getDate() + weeks * 7)
  return d
}

export function validateSeriesPayload(body) {
  const { name, partySize, time, frequency, anchorDate } = body
  if (!name || !name.trim()) return { error: 'Guest name is required' }
  const size = parseInt(partySize)
  if (!partySize || isNaN(size) || size < 1) return { error: 'Party size must be at least 1' }
  if (size > 100) return { error: 'Party size cannot exceed 100' }
  if (!time || !/^\d{1,2}:\d{2}$/.test(time)) return { error: 'A valid time is required' }
  if (!anchorDate || isNaN(new Date(anchorDate).getTime())) return { error: 'A valid start date is required' }

  const data = {
    name: name.trim(),
    phone: body.phone?.trim() || null,
    partySize: size,
    note: body.note?.trim() || null,
    time,
    anchorDate: new Date(anchorDate),
    frequency: frequency === 'MONTHLY' ? 'MONTHLY' : 'WEEKLY',
    daysOfWeek: [],
    intervalWeeks: 1,
    monthlyOrdinal: null,
    monthlyWeekday: null,
  }

  if (data.frequency === 'WEEKLY') {
    const days = Array.isArray(body.daysOfWeek)
      ? [...new Set(body.daysOfWeek.map((d) => parseInt(d)))].filter((d) => d >= 0 && d <= 6)
      : []
    if (days.length === 0) return { error: 'Pick at least one weekday' }
    const interval = parseInt(body.intervalWeeks)
    data.daysOfWeek = days
    data.intervalWeeks = !isNaN(interval) && interval >= 1 ? interval : 1
  } else {
    const ordinal = parseInt(body.monthlyOrdinal)
    const weekday = parseInt(body.monthlyWeekday)
    if (![1, 2, 3, 4, -1].includes(ordinal)) return { error: 'Pick which week of the month' }
    if (isNaN(weekday) || weekday < 0 || weekday > 6) return { error: 'Pick a weekday' }
    data.monthlyOrdinal = ordinal
    data.monthlyWeekday = weekday
  }

  return { data }
}

function rowsFor(series, dates) {
  return dates.map((scheduledAt) => ({
    name: series.name,
    phone: series.phone,
    partySize: series.partySize,
    note: series.note,
    scheduledAt,
    status: 'CONFIRMED',
    seriesId: series.id,
    createdById: series.createdById ?? null,
  }))
}

// Generate occurrences for a freshly created series and stamp generatedThrough.
export async function generateForSeries(series) {
  const today = startOfToday()
  const from = new Date(Math.max(today.getTime(), startOfDay(series.anchorDate).getTime()))
  const through = addWeeks(today, HORIZON_WEEKS)
  const dates = generateOccurrenceDates(series, from, through)
  if (dates.length) {
    await prisma.reservation.createMany({ data: rowsFor(series, dates), skipDuplicates: true })
  }
  await prisma.reservationSeries.update({
    where: { id: series.id },
    data: { generatedThrough: through },
  })
}

// After a pattern change: wipe future occurrences and rebuild them through the horizon.
export async function regenerateFutureForSeries(series) {
  const today = startOfToday()
  await prisma.reservation.deleteMany({
    where: { seriesId: series.id, scheduledAt: { gte: today } },
  })
  await generateForSeries(series)
}

// Rolling top-up: extend any active series whose horizon is within the buffer window.
// Cheap no-op when nothing is due (most calls).
export async function topUpActiveSeries() {
  const today = startOfToday()
  const buffer = addWeeks(today, BUFFER_WEEKS)
  const horizon = addWeeks(today, HORIZON_WEEKS)
  const due = await prisma.reservationSeries.findMany({
    where: { active: true, generatedThrough: { lt: buffer } },
  })
  for (const series of due) {
    const from = new Date(Math.max(today.getTime(), startOfDay(series.generatedThrough).getTime()))
    const dates = generateOccurrenceDates(series, from, horizon)
    if (dates.length) {
      await prisma.reservation.createMany({ data: rowsFor(series, dates), skipDuplicates: true })
    }
    await prisma.reservationSeries.update({
      where: { id: series.id },
      data: { generatedThrough: horizon },
    })
  }
}
