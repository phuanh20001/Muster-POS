ALTER TABLE "PaymentSettings" ADD COLUMN "onlineProvider" TEXT NOT NULL DEFAULT 'STRIPE';

UPDATE "PaymentSettings" SET "onlineProvider" = "provider" WHERE id = 1;
