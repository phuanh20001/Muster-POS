-- One order per payment reference. A card charge produces a paymentIntentId
-- (comma-joined for split card legs); recording the same ref twice would be a
-- duplicate order for one charge. Partial unique index (NULLs excluded so the
-- many cash/no-ref orders are unaffected). Belt-and-suspenders behind the
-- route's idempotency short-circuit — the DB rejects a racing duplicate.
CREATE UNIQUE INDEX "Order_paymentIntentId_key" ON "Order" ("paymentIntentId") WHERE "paymentIntentId" IS NOT NULL;
