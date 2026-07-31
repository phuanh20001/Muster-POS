-- CreateTable
CREATE TABLE "ReservationSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "reminderLeadMinutes" INTEGER NOT NULL DEFAULT 120,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReservationSettings_pkey" PRIMARY KEY ("id")
);
