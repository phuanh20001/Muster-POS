-- Null any pre-existing orphaned references (a stockItemId with no matching
-- StockItem, possible before this FK existed) so ADD CONSTRAINT can't fail on
-- the live DB. A null link is exactly what SetNull would have produced anyway.
UPDATE "StockReceivingLine" l
SET "stockItemId" = NULL
WHERE l."stockItemId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "StockItem" s WHERE s.id = l."stockItemId");

-- AddForeignKey
ALTER TABLE "StockReceivingLine" ADD CONSTRAINT "StockReceivingLine_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
