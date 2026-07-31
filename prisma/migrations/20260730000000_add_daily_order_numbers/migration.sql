-- Short per-day ticket numbers ("order 12") alongside the permanent Order.id.
ALTER TABLE "Order" ADD COLUMN     "businessDate" TEXT,
                   ADD COLUMN     "dailyNumber" INTEGER;

-- One row per trading day; "lastNumber" is the last ticket handed out that day.
CREATE TABLE "OrderDayCounter" (
    "businessDate" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderDayCounter_pkey" PRIMARY KEY ("businessDate")
);

-- A ticket number is only unique within its day. NULLs are distinct in Postgres,
-- so historical orders (which have none) do not collide.
CREATE UNIQUE INDEX "Order_businessDate_dailyNumber_key" ON "Order"("businessDate", "dailyNumber");
