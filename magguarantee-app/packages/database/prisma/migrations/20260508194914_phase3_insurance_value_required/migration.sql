/*
  Warnings:

  - Made the column `insuranceValue` on table `carriers` required. This step will fail if there are existing NULL values in that column.

*/

-- Backfill any pre-existing NULL `insuranceValue` rows so the SET NOT NULL
-- below can succeed. Dev/seed environments only — no production data has
-- ever been imported (legacy app was never deployed; see CLAUDE.md). The
-- placeholder `0` exists purely to satisfy the constraint on stale dev
-- rows that predate this requirement; the next-step Zod schema enforces
-- `> 0` at the API boundary, so this value cannot survive a round-trip
-- through the create/update endpoints. Real seeds use a sensible default
-- (see prisma/seed.ts).
UPDATE "carriers" SET "insuranceValue" = 0 WHERE "insuranceValue" IS NULL;

-- AlterTable
ALTER TABLE "carriers" ALTER COLUMN "insuranceValue" SET NOT NULL;
