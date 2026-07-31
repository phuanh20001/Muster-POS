export function pairClockEventsForDisplay(events) {
  const pairs = []
  let pendingIn = null
  for (const e of events) {
    if (e.type === 'IN') {
      if (pendingIn) pairs.push({ in: pendingIn, out: null, duration: null })
      pendingIn = e
    } else if (e.type === 'OUT' && pendingIn) {
      pairs.push({
        in: pendingIn,
        out: e,
        duration: new Date(e.timestamp) - new Date(pendingIn.timestamp),
      })
      pendingIn = null
    }
  }
  if (pendingIn) pairs.push({ in: pendingIn, out: null, duration: null })
  return pairs
}

export function hoursByDayFromRecords(records) {
  const days = payrollDaysFromRecords(records)
  const hours = {}
  for (const [dateKey, day] of Object.entries(days)) {
    hours[dateKey] = day.hours
  }
  return hours
}

function localDateKey(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function payrollDaysFromRecords(records) {
  // Pair across the whole (already date-sorted) record list BEFORE bucketing by
  // day, so an overnight shift (clock IN 22:00, OUT 02:00 next day) pairs instead
  // of splitting into two 0h day-buckets. Each shift is attributed to the day it
  // STARTED. Bucketing first (the old approach) is what made overnight shifts read
  // as 0h. (A shift whose OUT falls outside the queried range still dangles — an
  // inherent limit of the range query, not the pairing.)
  const pairs = pairClockEventsForDisplay(records)

  const dayMs = {}
  const dayShifts = {}
  const touch = (key) => {
    if (!dayShifts[key]) { dayShifts[key] = []; dayMs[key] = 0 }
  }

  for (const p of pairs) {
    const key = localDateKey(p.in.timestamp)
    touch(key)
    if (p.out) {
      // Clamp: a bad record pair (e.g. same-day 22:00 IN / 02:00 OUT written by an
      // unguarded form) must never subtract from the total.
      dayMs[key] += Math.max(0, p.duration)
      dayShifts[key].push({ start: p.in.timestamp, end: p.out.timestamp })
    } else {
      dayShifts[key].push({ start: p.in.timestamp, end: null })
    }
  }

  const days = {}
  for (const key of Object.keys(dayShifts)) {
    days[key] = {
      hours: Math.round((dayMs[key] / 3600000) * 100) / 100,
      shifts: dayShifts[key],
    }
  }
  return days
}

export function pairClockEventsForOverlap(records, { openEnd }) {
  const shifts = []
  let pendingIn = null
  for (const r of records) {
    if (r.type === 'IN') {
      if (pendingIn) shifts.push({ start: pendingIn.timestamp, end: openEnd, open: true })
      pendingIn = r
    } else if (r.type === 'OUT' && pendingIn) {
      shifts.push({ start: pendingIn.timestamp, end: r.timestamp, open: false })
      pendingIn = null
    }
  }
  if (pendingIn) shifts.push({ start: pendingIn.timestamp, end: openEnd, open: true })
  return shifts
}
