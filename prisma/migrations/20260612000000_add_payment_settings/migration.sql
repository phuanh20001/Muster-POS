-- CreateTable
CREATE TABLE "PaymentSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "cardSurchargeType" TEXT NOT NULL DEFAULT '',
    "cardSurchargeValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "blockedBrands" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentSettings_pkey" PRIMARY KEY ("id")
);
