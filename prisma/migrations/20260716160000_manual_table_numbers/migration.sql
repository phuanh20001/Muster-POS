-- Manual table numbers: the cashier types the number of the stand handed to the
-- customer instead of picking a table off the floor plan.

-- AlterTable
ALTER TABLE "FeatureSettings" ADD COLUMN     "manualTableNumbers" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tableNumberMax" INTEGER NOT NULL DEFAULT 20;

-- AlterTable: marks Order.tableNumber as a typed table number rather than the
-- customer name it otherwise holds when there is no tableId. Existing rows keep
-- false, so their labels are unchanged.
ALTER TABLE "Order" ADD COLUMN     "tableManual" BOOLEAN NOT NULL DEFAULT false;
