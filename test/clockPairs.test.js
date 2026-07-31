import test from 'node:test'
import assert from 'node:assert/strict'
import { payrollDaysFromRecords, pairClockEventsForDisplay } from '@/lib/clockPairs'

// Local-time timestamp helper: builds a Date at the given local wall-clock time
// so the day-bucketing (which uses local getFullYear/Month/Date) is deterministic
// regardless of the runner's timezone.
const at = (y, mo, d, h, mi, type) => ({ type, timestamp: new Date(y, mo - 1, d, h, mi, 0, 0) })

const totalHours = (days) => Object.values(days).reduce((s, x) => s + x.hours, 0)

test('normal same-day shift 09:00-17:00 = 8h on that day', () => {
  const days = payrollDaysFromRecords([at(2026, 7, 8, 9, 0, 'IN'), at(2026, 7, 8, 17, 0, 'OUT')])
  assert.equal(days['2026-07-08'].hours, 8)
  assert.equal(totalHours(days), 8)
})

test('OVERNIGHT shift (IN 22:00 d8, OUT 02:00 d9) pairs to 4h on the START day', () => {
  const days = payrollDaysFromRecords([at(2026, 7, 8, 22, 0, 'IN'), at(2026, 7, 9, 2, 0, 'OUT')])
  // The whole 4h lands on the day the shift started; the next day is not created.
  assert.equal(days['2026-07-08'].hours, 4)
  assert.equal(days['2026-07-09'], undefined)
  assert.equal(totalHours(days), 4)
})

test('negative-duration pair (out before in, same day) clamps to 0 — never subtracts', () => {
  const days = payrollDaysFromRecords([at(2026, 7, 8, 22, 0, 'IN'), at(2026, 7, 8, 2, 0, 'OUT')])
  // Sorted by timestamp the OUT(02:00) comes first with no preceding IN and is
  // dropped; the IN(22:00) then dangles -> 0h. Crucially the total is never < 0.
  assert.equal(days['2026-07-08'].hours, 0)
  assert.ok(totalHours(days) >= 0)
})

test('forgotten clock-out (dangling IN) contributes 0h but still lists the open shift', () => {
  const days = payrollDaysFromRecords([at(2026, 7, 8, 9, 0, 'IN')])
  assert.equal(days['2026-07-08'].hours, 0)
  assert.equal(days['2026-07-08'].shifts.length, 1)
  assert.equal(days['2026-07-08'].shifts[0].end, null)
})

test('two shifts in one day sum (09-12 + 13-17 = 7h)', () => {
  const days = payrollDaysFromRecords([
    at(2026, 7, 8, 9, 0, 'IN'), at(2026, 7, 8, 12, 0, 'OUT'),
    at(2026, 7, 8, 13, 0, 'IN'), at(2026, 7, 8, 17, 0, 'OUT'),
  ])
  assert.equal(days['2026-07-08'].hours, 7)
})

test('half-hour shifts accumulate exactly (7 x 7.5h = 52.5h, no float drift)', () => {
  const recs = []
  for (let d = 1; d <= 7; d++) recs.push(at(2026, 7, d, 9, 0, 'IN'), at(2026, 7, d, 16, 30, 'OUT'))
  const days = payrollDaysFromRecords(recs)
  assert.equal(totalHours(days), 52.5)
})

test('pairClockEventsForDisplay leaves duration raw (signed) — consumers clamp', () => {
  // The primitive stays honest; clamping is each caller's decision.
  const [pair] = pairClockEventsForDisplay([at(2026, 7, 8, 22, 0, 'IN'), at(2026, 7, 8, 22, 30, 'OUT')])
  assert.equal(pair.duration, 30 * 60 * 1000)
})
