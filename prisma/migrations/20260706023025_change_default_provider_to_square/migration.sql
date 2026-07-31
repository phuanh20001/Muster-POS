-- AlterTable
ALTER TABLE "Order" ALTER COLUMN "paymentProvider" SET DEFAULT 'SQUARE';

-- AlterTable
ALTER TABLE "PaymentSettings" ALTER COLUMN "provider" SET DEFAULT 'SQUARE',
ALTER COLUMN "onlineProvider" SET DEFAULT 'SQUARE';
