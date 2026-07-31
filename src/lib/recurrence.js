// CommonJS so the same logic runs both inside Next (webpack interop) and via the
// standalone node self-check (scripts/test-recurrence.js).

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const ORDINAL_LABEL = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', '-1': 'last' }

function parseTime(time) {
  const [h, m] = String(time ?? '0:0').split(':').map((n) => parseInt(n, 10))
  return { h: Number.isFinite(h) ? h : 0, m: Number.isFinite(m) ? m : 0 }
}

function startOfDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function atTime(year, monthIndex, day, time) {
  const { h, m } = parseTime(time)
  return new Date(year, monthIndex, day, h, m, 0, 0)
}

function weekStart(date) {
  const d = startOfDay(date)
  d.setDate(d.getDate() - d.getDay())
  return d
}

// Whole weeks between two dates' week-start (Sunday). Math.round absorbs DST hour drift.
function weeksBetween(a, b) {
  return Math.round((weekStart(a).getTime() - weekStart(b).getTime()) / (7 * 24 * 60 * 60 * 1000))
}

function nthWeekdayOfMonth(year, monthIndex, ordinal, weekday) {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate()
  if (ordinal === -1) {
    for (let d = lastDay; d >= 1; d--) {
      if (new Date(year, monthIndex, d).getDay() === weekday) return d
    }
    return null
  }
  let count = 0
  for (let d = 1; d <= lastDay; d++) {
    if (new Date(year, monthIndex, d).getDay() === weekday) {
      count++
      if (count === ordinal) return d
    }
  }
  return null
}

// Returns concrete occurrence Dates (with the series time applied) whose calendar
// day falls within [fromDate, throughDate] inclusive.
function generateOccurrenceDates(series, fromDate, throughDate) {
  const from = startOfDay(fromDate)
  const through = startOfDay(throughDate)
  if (through < from) return []
  const out = []

  if (series.frequency === 'MONTHLY') {
    const { monthlyOrdinal: ordinal, monthlyWeekday: weekday } = series
    if (ordinal == null || weekday == null) return []
    let y = from.getFullYear()
    let mo = from.getMonth()
    const endY = through.getFullYear()
    const endMo = through.getMonth()
    while (y < endY || (y === endY && mo <= endMo)) {
      const day = nthWeekdayOfMonth(y, mo, ordinal, weekday)
      if (day) {
        const cand = new Date(y, mo, day)
        if (cand >= from && cand <= through) out.push(atTime(y, mo, day, series.time))
      }
      mo++
      if (mo > 11) { mo = 0; y++ }
    }
    return out
  }

  // WEEKLY (intervalWeeks === 1 means every week)
  const days = Array.isArray(series.daysOfWeek) ? series.daysOfWeek : []
  if (days.length === 0) return []
  const interval = series.intervalWeeks > 0 ? series.intervalWeeks : 1
  const anchor = series.anchorDate ? new Date(series.anchorDate) : from
  for (const cur = new Date(from); cur <= through; cur.setDate(cur.getDate() + 1)) {
    if (!days.includes(cur.getDay())) continue
    if (interval > 1) {
      const wi = weeksBetween(cur, anchor)
      if (((wi % interval) + interval) % interval !== 0) continue
    }
    out.push(atTime(cur.getFullYear(), cur.getMonth(), cur.getDate(), series.time))
  }
  return out
}

function describeRecurrence(series) {
  if (series.frequency === 'MONTHLY') {
    const ord = ORDINAL_LABEL[series.monthlyOrdinal] ?? `${series.monthlyOrdinal}th`
    return `Monthly on ${ord} ${WEEKDAY_SHORT[series.monthlyWeekday] ?? '?'}`
  }
  const days = (Array.isArray(series.daysOfWeek) ? series.daysOfWeek : [])
    .slice()
    .sort((a, b) => a - b)
    .map((d) => WEEKDAY_SHORT[d])
    .join(', ')
  const every = series.intervalWeeks > 1 ? `Every ${series.intervalWeeks} weeks` : 'Weekly'
  return `${every} on ${days || '—'}`
}

module.exports = { generateOccurrenceDates, describeRecurrence, nthWeekdayOfMonth, WEEKDAY_SHORT }
