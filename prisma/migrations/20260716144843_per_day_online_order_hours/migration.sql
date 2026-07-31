-- Per-day online ordering hours (weekday vs weekend).

-- CreateTable
CREATE TABLE "OnlineOrderHours" (
    "id" SERIAL NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "openTime" TEXT NOT NULL DEFAULT '07:00',
    "closeTime" TEXT NOT NULL DEFAULT '18:00',

    CONSTRAINT "OnlineOrderHours_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OnlineOrderHours_dayOfWeek_key" ON "OnlineOrderHours"("dayOfWeek");

-- Seed one row per weekday, carrying over the single window that previously
-- applied to every day (and any all-day closures) so no configuration is lost.
INSERT INTO "OnlineOrderHours" ("dayOfWeek", "closed", "openTime", "closeTime")
SELECT
    d.day,
    COALESCE(d.day = ANY(s."closedDays"), false),
    COALESCE(s."openTime", '07:00'),
    COALESCE(s."closeTime", '18:00')
FROM generate_series(0, 6) AS d(day)
LEFT JOIN "OnlineOrderSettings" s ON s."id" = 1;

-- DropColumn: superseded by the per-day rows above.
ALTER TABLE "OnlineOrderSettings" DROP COLUMN "openTime",
DROP COLUMN "closeTime",
DROP COLUMN "closedDays";
