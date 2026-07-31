-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "paymentIntentId" TEXT;

-- CreateTable
CREATE TABLE "TerminalReader" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "stripeReaderId" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TerminalReader_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TerminalReader_name_key" ON "TerminalReader"("name");
