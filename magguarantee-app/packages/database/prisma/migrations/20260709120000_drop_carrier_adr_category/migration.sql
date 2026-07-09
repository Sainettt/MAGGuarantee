-- Drop the `adr` value from CarrierAttachmentCategory.
--
-- ADR is NOT a carrier-level (company) document: it is per-vehicle
-- (Vehicle.adr / adrClasses) and per-driver (świadectwo scan via
-- DriverAttachmentCategory.adr). The carrier-level category was a legacy
-- modeling bug and is removed end-to-end.
--
-- DATA-SAFE ON A NON-EMPTY DATABASE: any existing carrier attachment carrying
-- the soon-to-be-removed `adr` value is re-categorized to `other` FIRST, so the
-- subsequent `USING ("category"::text::"CarrierAttachmentCategory_new")` cast
-- never encounters a value missing from the new enum (which would abort the
-- transaction). Rows are re-categorized, never deleted. The
-- `carrier_attachments_carrierId_category_idx` index is rebuilt automatically by
-- Postgres when the column type changes — no manual drop/recreate needed. There
-- is no DEFAULT on `carrier_attachments.category`.

-- AlterEnum
BEGIN;
UPDATE "carrier_attachments" SET "category" = 'other' WHERE "category" = 'adr';
CREATE TYPE "CarrierAttachmentCategory_new" AS ENUM ('insurance', 'license', 'kreptd', 'other');
ALTER TABLE "carrier_attachments" ALTER COLUMN "category" TYPE "CarrierAttachmentCategory_new" USING ("category"::text::"CarrierAttachmentCategory_new");
ALTER TYPE "CarrierAttachmentCategory" RENAME TO "CarrierAttachmentCategory_old";
ALTER TYPE "CarrierAttachmentCategory_new" RENAME TO "CarrierAttachmentCategory";
DROP TYPE "CarrierAttachmentCategory_old";
COMMIT;
