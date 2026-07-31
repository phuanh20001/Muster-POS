-- Add provider-agnostic checkout reference; migrate Stripe session ids when present; drop legacy column.
ALTER TABLE "Order" ADD COLUMN "checkoutRef" TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'Order'
      AND column_name = 'stripeSessionId'
  ) THEN
    UPDATE "Order" SET "checkoutRef" = "stripeSessionId" WHERE "stripeSessionId" IS NOT NULL;
    ALTER TABLE "Order" DROP COLUMN "stripeSessionId";
  END IF;
END $$;

CREATE UNIQUE INDEX "Order_checkoutRef_key" ON "Order"("checkoutRef");
