-- CreateTable
CREATE TABLE "ShiftSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "shiftRoutineEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftSettings_pkey" PRIMARY KEY ("id")
);
