-- CreateTable
CREATE TABLE "Supplier" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" SERIAL NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "category" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "spentAt" TIMESTAMP(3) NOT NULL,
    "supplierId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockReceiving" (
    "id" SERIAL NOT NULL,
    "supplierId" INTEGER,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "totalCost" DECIMAL(10,2) NOT NULL,
    "userId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockReceiving_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockReceivingLine" (
    "id" SERIAL NOT NULL,
    "receivingId" INTEGER NOT NULL,
    "stockItemId" INTEGER,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" DECIMAL(10,2) NOT NULL,
    "lineCost" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "StockReceivingLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "expensesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "purchasingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureSettings_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReceiving" ADD CONSTRAINT "StockReceiving_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReceivingLine" ADD CONSTRAINT "StockReceivingLine_receivingId_fkey" FOREIGN KEY ("receivingId") REFERENCES "StockReceiving"("id") ON DELETE CASCADE ON UPDATE CASCADE;
