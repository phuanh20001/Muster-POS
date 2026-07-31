-- At most one open cash session (closedAt IS NULL) may exist at a time.
-- Prisma can't express a partial unique index in schema.prisma, so it's raw SQL.
-- Makes the "a session is already open" check race-proof: two concurrent opens
-- can no longer both create a row — the second insert is rejected by the DB.
CREATE UNIQUE INDEX "CashSession_single_open" ON "CashSession" ((1)) WHERE "closedAt" IS NULL;
