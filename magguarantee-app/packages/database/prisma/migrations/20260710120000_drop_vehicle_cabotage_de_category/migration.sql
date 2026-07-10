-- Drop the `cabotage_de` value from VehicleAttachmentCategory.
--
-- Stakeholder decision (final, 2026-07-10): the DE cabotage-permit scan is
-- dropped — `cabotage_de_insurance` (ubezpieczenie kabotażowe DE) is now the
-- SOLE cabotage document, required by the API when Vehicle.cabotageDe=true.
-- This removes the `cabotage_de` attachment category end-to-end. The
-- Vehicle.cabotageDe / Vehicle.cabotageFr BOOLEAN flags are unaffected and stay.
--
-- DATA-SAFE ON A NON-EMPTY DATABASE: the permit scan concept is gone entirely,
-- so any existing `cabotage_de` vehicle attachment is DELETED FIRST (data is
-- fake; the resulting orphaned MinIO objects are acceptable). This guarantees
-- the subsequent `USING ("category"::text::"VehicleAttachmentCategory_new")`
-- cast never encounters a value missing from the new enum (which would abort the
-- transaction). The `vehicle_attachments_vehicleId_category_idx` index is
-- rebuilt automatically by Postgres when the column type changes — no manual
-- drop/recreate needed. There is no DEFAULT on `vehicle_attachments.category`.

-- Purge rows carrying the soon-to-be-removed value (permit scan removed entirely).
DELETE FROM "vehicle_attachments" WHERE "category" = 'cabotage_de';

-- AlterEnum
BEGIN;
CREATE TYPE "VehicleAttachmentCategory_new" AS ENUM ('gps', 'agreement', 'cabotage_de_insurance');
ALTER TABLE "vehicle_attachments" ALTER COLUMN "category" TYPE "VehicleAttachmentCategory_new" USING ("category"::text::"VehicleAttachmentCategory_new");
ALTER TYPE "VehicleAttachmentCategory" RENAME TO "VehicleAttachmentCategory_old";
ALTER TYPE "VehicleAttachmentCategory_new" RENAME TO "VehicleAttachmentCategory";
DROP TYPE "VehicleAttachmentCategory_old";
COMMIT;
