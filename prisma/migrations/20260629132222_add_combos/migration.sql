-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "isCombo" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ComboSlot" (
    "id" SERIAL NOT NULL,
    "comboId" INTEGER NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ComboSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComboSlotOption" (
    "id" SERIAL NOT NULL,
    "slotId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,

    CONSTRAINT "ComboSlotOption_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ComboSlot" ADD CONSTRAINT "ComboSlot_comboId_fkey" FOREIGN KEY ("comboId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComboSlotOption" ADD CONSTRAINT "ComboSlotOption_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "ComboSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComboSlotOption" ADD CONSTRAINT "ComboSlotOption_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
