-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "manualDiscount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "refundNote" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "surchargeAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "surchargeType" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "surchargeValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "tipAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "priceAdjustment" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "priceAdjustmentNote" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "ProductModifier" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProductModifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItemModifier" (
    "id" SERIAL NOT NULL,
    "orderItemId" INTEGER NOT NULL,
    "modifierId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "OrderItemModifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrinterConfig" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "ip" TEXT NOT NULL DEFAULT '',
    "port" INTEGER NOT NULL DEFAULT 9100,
    "printReceipts" BOOLEAN NOT NULL DEFAULT true,
    "openDrawer" BOOLEAN NOT NULL DEFAULT false,
    "printDockets" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PrinterConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PrinterConfig_name_key" ON "PrinterConfig"("name");

-- AddForeignKey
ALTER TABLE "ProductModifier" ADD CONSTRAINT "ProductModifier_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemModifier" ADD CONSTRAINT "OrderItemModifier_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemModifier" ADD CONSTRAINT "OrderItemModifier_modifierId_fkey" FOREIGN KEY ("modifierId") REFERENCES "ProductModifier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
