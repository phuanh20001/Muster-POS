-- DropForeignKey
ALTER TABLE "OrderItemModifier" DROP CONSTRAINT "OrderItemModifier_modifierId_fkey";

-- AlterTable
ALTER TABLE "OrderItemModifier" ADD COLUMN     "categoryModifierId" INTEGER,
ALTER COLUMN "modifierId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "CategoryModifier" (
    "id" SERIAL NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CategoryModifier_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CategoryModifier" ADD CONSTRAINT "CategoryModifier_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemModifier" ADD CONSTRAINT "OrderItemModifier_modifierId_fkey" FOREIGN KEY ("modifierId") REFERENCES "ProductModifier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemModifier" ADD CONSTRAINT "OrderItemModifier_categoryModifierId_fkey" FOREIGN KEY ("categoryModifierId") REFERENCES "CategoryModifier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
