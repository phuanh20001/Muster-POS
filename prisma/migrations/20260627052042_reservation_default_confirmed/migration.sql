-- AlterTable
ALTER TABLE "Reservation" ALTER COLUMN "status" SET DEFAULT 'CONFIRMED';

-- Pending reservation state removed: existing pending bookings are now confirmed
UPDATE "Reservation" SET "status" = 'CONFIRMED' WHERE "status" = 'PENDING';
