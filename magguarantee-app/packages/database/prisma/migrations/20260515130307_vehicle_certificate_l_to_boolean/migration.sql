-- Convert Vehicle.certificateL from enum CertificateL { L1 | L2 | L3 } to Boolean NOT NULL.
--
-- Decision: collapse the three noise classes into a single TAK/NIE flag.
--   L1 / L2 / L3  -> true   (vehicle holds an L-certificate, any class)
--   anything else -> false
--
-- The old column is NOT NULL today (phase3_blocks tightened it), so in
-- practice every row maps to `true`. The CASE keeps the migration safe if
-- any future stage adds the column back as nullable before this runs, or
-- a row gets a value outside the enum via a checkpoint dump.

-- 1. Add the new boolean column with a temporary default so the NOT NULL
--    add is non-blocking on existing rows.
ALTER TABLE "vehicles"
  ADD COLUMN "certificateL_new" BOOLEAN NOT NULL DEFAULT false;

-- 2. Backfill: L1 / L2 / L3 -> true, everything else -> false.
UPDATE "vehicles"
SET "certificateL_new" = CASE
  WHEN "certificateL"::text IN ('L1', 'L2', 'L3') THEN true
  ELSE false
END;

-- 3. Drop the old enum-typed column.
ALTER TABLE "vehicles" DROP COLUMN "certificateL";

-- 4. Promote the new column to the canonical name.
ALTER TABLE "vehicles" RENAME COLUMN "certificateL_new" TO "certificateL";

-- 5. Strip the placeholder DEFAULT — the application must always pass the
--    value explicitly (matches Prisma schema: `certificateL Boolean` with
--    no default).
ALTER TABLE "vehicles" ALTER COLUMN "certificateL" DROP DEFAULT;

-- 6. The enum type is no longer referenced by any column or other type;
--    drop it so the catalog stays clean.
DROP TYPE "CertificateL";
