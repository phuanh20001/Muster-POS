const assert = require('node:assert')
const { generateOccurrenceDates, describeRecurrence } = require('../src/lib/recurrence')

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// 1. Weekly on Mon + Fri, June 2026 (Mon=1, Fri=5). June 1 2026 is a Monday.
const weekly = {
  frequency: 'WEEKLY',
  daysOfWeek: [1, 5],
  intervalWeeks: 1,
  time: '09:30',
  anchorDate: new Date(2026, 5, 1),
}
const w = generateOccurrenceDates(weekly, new Date(2026, 5, 1), new Date(2026, 5, 14)).map(ymd)
assert.deepStrictEqual(w, [
  '2026-06-01 09:30', // Mon
  '2026-06-05 09:30', // Fri
  '2026-06-08 09:30', // Mon
  '2026-06-12 09:30', // Fri
])

// 2. Every 2 weeks on Wed (anchor week = week of June 1). Wednesdays: 3,10,17,24.
//    Anchor week contains Jun 3; +2 weeks => Jun 17; skip Jun 10 & Jun 24.
const biweekly = {
  frequency: 'WEEKLY',
  daysOfWeek: [3],
  intervalWeeks: 2,
  time: '14:00',
  anchorDate: new Date(2026, 5, 1),
}
const b = generateOccurrenceDates(biweekly, new Date(2026, 5, 1), new Date(2026, 5, 30)).map(ymd)
assert.deepStrictEqual(b, ['2026-06-03 14:00', '2026-06-17 14:00'])

// 3. Monthly on last Friday. June 2026 last Friday = Jun 26; July 2026 = Jul 31.
const monthly = {
  frequency: 'MONTHLY',
  monthlyOrdinal: -1,
  monthlyWeekday: 5,
  time: '18:00',
}
const m = generateOccurrenceDates(monthly, new Date(2026, 5, 1), new Date(2026, 6, 31)).map(ymd)
assert.deepStrictEqual(m, ['2026-06-26 18:00', '2026-07-31 18:00'])

// 4. Monthly on 2nd Monday of July 2026 = Jul 13.
const monthly2 = {
  frequency: 'MONTHLY',
  monthlyOrdinal: 2,
  monthlyWeekday: 1,
  time: '08:00',
}
const m2 = generateOccurrenceDates(monthly2, new Date(2026, 6, 1), new Date(2026, 6, 31)).map(ymd)
assert.deepStrictEqual(m2, ['2026-07-13 08:00'])

// 5. Descriptions
assert.strictEqual(describeRecurrence(weekly), 'Weekly on Mon, Fri')
assert.strictEqual(describeRecurrence(biweekly), 'Every 2 weeks on Wed')
assert.strictEqual(describeRecurrence(monthly), 'Monthly on last Fri')
assert.strictEqual(describeRecurrence(monthly2), 'Monthly on 2nd Mon')

console.log('test-recurrence: all assertions passed')
