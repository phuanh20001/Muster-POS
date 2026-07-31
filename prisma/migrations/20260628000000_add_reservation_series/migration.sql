-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "seriesId" INTEGER;

-- CreateTable
CREATE TABLE "ReservationSeries" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "partySize" INTEGER NOT NULL,
    "note" TEXT,
    "time" TEXT NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'WEEKLY',
    "daysOfWeek" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "intervalWeeks" INTEGER NOT NULL DEFAULT 1,
    "monthlyOrdinal" INTEGER,
    "monthlyWeekday" INTEGER,
    "anchorDate" TIMESTAMP(3) NOT NULL,
    "generatedThrough" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER,

    CONSTRAINT "ReservationSeries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_seriesId_scheduledAt_key" ON "Reservation"("seriesId", "scheduledAt");

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "ReservationSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationSeries" ADD CONSTRAINT "ReservationSeries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
