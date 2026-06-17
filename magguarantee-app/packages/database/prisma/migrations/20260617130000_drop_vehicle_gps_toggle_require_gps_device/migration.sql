-- Make the GPS tracker device id (`vehicles.gpsMobilePhone`) mandatory for every
-- vehicle and drop the legacy "has GPS" toggle.
--
-- Product decision 2026-06-17: every vehicle in the km-guarantee program is GPS-
-- tracked, so the per-vehicle `gps` boolean no longer carries information and the
-- device id is always present. We therefore:
--   1. DROP the conditional CHECK `vehicle_gps_device_when_gps_on` (was
--      "gpsMobilePhone required iff gps=true", added in 20260507191424_phase3_blocks);
--   2. DROP the `gps` BOOLEAN column;
--   3. promote `gpsMobilePhone` to NOT NULL.
--
-- Forward-only: the DB is greenfield (empty + seed-only, never in production per
-- CLAUDE.md), so there are no real rows to preserve. The CHECK must be dropped
-- BEFORE the `gps` column it references; SET NOT NULL comes last.
--
-- A defensive backfill stamps a placeholder device id on any stale dev rows that
-- predate this change (created via the old `gps=false` path with a NULL device
-- id); without it SET NOT NULL would fail on a dev DB. It is a no-op on a truly
-- empty DB and Zod (`gpsMobilePhone` required, non-empty) ensures the placeholder
-- never survives a round-trip through the API create/update path.

-- DropConstraint (status-conditional CHECK referencing the `gps` column)
ALTER TABLE "vehicles" DROP CONSTRAINT "vehicle_gps_device_when_gps_on";

-- AlterTable
ALTER TABLE "vehicles" DROP COLUMN "gps";

-- Backfill stale NULL device ids before tightening to NOT NULL (dev-only safety).
UPDATE "vehicles" SET "gpsMobilePhone" = 'UNKNOWN' WHERE "gpsMobilePhone" IS NULL;

-- AlterTable
ALTER TABLE "vehicles" ALTER COLUMN "gpsMobilePhone" SET NOT NULL;
