import { localDayKey } from '@/lib/accounting'

// Draws the next per-day ticket number ("order 12") for the given trading day.
//
// One statement, so it is atomic: two tills checking out at the same instant each
// get their own number. ON CONFLICT takes a row lock on the day's counter, so the
// second call waits for the first to commit rather than reading a stale value —
// which a SELECT max(dailyNumber) + 1 would happily do. A new day has no row yet,
// so the INSERT wins and numbering restarts at 1.
//
// Pass the transaction client when the caller has one: the number is then released
// again if the order fails to save, keeping the sequence gapless. @updatedAt does
// not apply to raw SQL, hence the explicit NOW().
export async function nextDailyNumber(client, date = new Date()) {
  const businessDate = localDayKey(date)
  const rows = await client.$queryRaw`
    INSERT INTO "OrderDayCounter" ("businessDate", "lastNumber", "updatedAt")
    VALUES (${businessDate}, 1, NOW())
    ON CONFLICT ("businessDate")
    DO UPDATE SET "lastNumber" = "OrderDayCounter"."lastNumber" + 1, "updatedAt" = NOW()
    RETURNING "lastNumber"
  `
  return { businessDate, dailyNumber: rows[0].lastNumber }
}
