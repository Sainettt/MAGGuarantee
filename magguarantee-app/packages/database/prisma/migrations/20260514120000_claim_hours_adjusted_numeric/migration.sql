/*
  Warnings:

  - The boolean `hoursAdjusted` flag on `claims` is dropped and replaced by two
    numeric columns: `origHoursAdjusted` (immutable carrier snapshot) and
    `hoursAdjustedValue` (verifier-mutable applied value). The boolean column
    is dropped outright — DB is seed-only per CLAUDE.md / docs/17-migration-roadmap.md,
    no production data exists to back-fill. Numeric NULL means "no data",
    `0` means "carrier explicitly entered zero".

*/
-- AlterTable
ALTER TABLE "claims" DROP COLUMN "hoursAdjusted",
ADD COLUMN     "hoursAdjustedValue" DECIMAL(5,2),
ADD COLUMN     "origHoursAdjusted" DECIMAL(5,2);
