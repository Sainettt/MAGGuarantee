-- Drop the `contract` (Umowa) value from VehicleAttachmentCategory.
--
-- Stakeholder decision (final, 2026-07-10): the umowa concept does NOT exist in
-- this business — porozumienie (Vehicle.agreement + `agreement` attachment) is
-- the ONLY vehicle document. This removes the `contract` attachment category
-- end-to-end and resolves the AMBIGUOUS quirk in docs/19-known-quirks.md §1.
-- Not to be confused with `gps` (umowa GPS), a different document that stays.
--
-- DATA-SAFE ON A NON-EMPTY DATABASE: the concept is gone entirely, so any
-- existing `contract` vehicle attachment is DELETED FIRST (data is fake; the
-- resulting orphaned MinIO objects are acceptable). This guarantees the
-- subsequent `USING ("category"::text::"VehicleAttachmentCategory_new")` cast
-- never encounters a value missing from the new enum (which would abort the
-- transaction). The `vehicle_attachments_vehicleId_category_idx` index is
-- rebuilt automatically by Postgres when the column type changes — no manual
-- drop/recreate needed. There is no DEFAULT on `vehicle_attachments.category`.

-- Purge rows carrying the soon-to-be-removed value (concept removed entirely).
DELETE FROM "vehicle_attachments" WHERE "category" = 'contract';

-- AlterEnum
BEGIN;
CREATE TYPE "VehicleAttachmentCategory_new" AS ENUM ('gps', 'agreement', 'cabotage_de', 'cabotage_de_insurance');
ALTER TABLE "vehicle_attachments" ALTER COLUMN "category" TYPE "VehicleAttachmentCategory_new" USING ("category"::text::"VehicleAttachmentCategory_new");
ALTER TYPE "VehicleAttachmentCategory" RENAME TO "VehicleAttachmentCategory_old";
ALTER TYPE "VehicleAttachmentCategory_new" RENAME TO "VehicleAttachmentCategory";
DROP TYPE "VehicleAttachmentCategory_old";
COMMIT;
