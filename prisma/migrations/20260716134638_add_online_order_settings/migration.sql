-- CreateTable
CREATE TABLE "OnlineOrderSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "hoursEnabled" BOOLEAN NOT NULL DEFAULT false,
    "openTime" TEXT NOT NULL DEFAULT '07:00',
    "closeTime" TEXT NOT NULL DEFAULT '18:00',
    "closedDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "acceptingOrders" BOOLEAN NOT NULL DEFAULT true,
    "closedMessage" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnlineOrderSettings_pkey" PRIMARY KEY ("id")
);
