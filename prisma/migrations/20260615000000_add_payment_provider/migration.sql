-- AlterTable
ALTER TABLE "PaymentSettings" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'STRIPE';

-- AlterTable
ALTER TABLE "TerminalReader" ADD COLUMN "squareDeviceId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "paymentProvider" TEXT NOT NULL DEFAULT 'STRIPE';
