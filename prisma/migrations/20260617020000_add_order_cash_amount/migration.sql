-- AlterTable
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "cashAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Backfill: CASH orders store full total as cash leg; CARD stays 0; SPLIT unknown history stays 0
UPDATE "Order" SET "cashAmount" = "total" WHERE "paymentMethod" = 'CASH' AND "cashAmount" = 0;
