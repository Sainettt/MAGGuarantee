-- Attachment-model expansion + vehicle ADR-category removal (2026-05-29).
--
--   Change 1 — Vehicle: remove the `adr` value from VehicleAttachmentCategory.
--              The kept `vehicles.adr` boolean and `vehicles.adrClasses` are
--              NOT touched. Postgres cannot DROP a value from an enum in place,
--              so the type is recreated. Any existing attachment rows whose
--              category = 'adr' are DELETED first (these are the rows being
--              removed) — otherwise the USING cast to the new type would fail.
--   Change 2 — Driver: add `adr` boolean + `driver_attachments` table.
--   Change 3 — Carrier: add `carrier_attachments` table.

-- CreateEnum
CREATE TYPE "DriverAttachmentCategory" AS ENUM ('adr');

-- CreateEnum
CREATE TYPE "CarrierAttachmentCategory" AS ENUM ('insurance', 'license', 'kreptd', 'other');

-- AlterEnum (Change 1): recreate VehicleAttachmentCategory without 'adr'.
-- Step 1: drop the attachment rows that still reference the value being
--         removed. These are the vehicle ADR-certificate attachments; the
--         feature is gone, so the rows are deleted (no migration target).
--         Without this DELETE the USING cast below errors on any 'adr' row.
DELETE FROM "vehicle_attachments" WHERE "category" = 'adr';

-- Step 2: create the new type, re-point the column, swap names, drop the old.
BEGIN;
CREATE TYPE "VehicleAttachmentCategory_new" AS ENUM ('contract', 'cabotage_de', 'cabotage_fr');
ALTER TABLE "vehicle_attachments" ALTER COLUMN "category" TYPE "VehicleAttachmentCategory_new" USING ("category"::text::"VehicleAttachmentCategory_new");
ALTER TYPE "VehicleAttachmentCategory" RENAME TO "VehicleAttachmentCategory_old";
ALTER TYPE "VehicleAttachmentCategory_new" RENAME TO "VehicleAttachmentCategory";
DROP TYPE "VehicleAttachmentCategory_old";
COMMIT;

-- AlterTable (Change 2): Driver ADR permit flag.
ALTER TABLE "drivers" ADD COLUMN     "adr" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable (Change 3): carrier_attachments
CREATE TABLE "carrier_attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "carrierId" UUID NOT NULL,
    "category" "CarrierAttachmentCategory" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "carrier_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable (Change 2): driver_attachments
CREATE TABLE "driver_attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "driverId" UUID NOT NULL,
    "category" "DriverAttachmentCategory" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "driver_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "carrier_attachments_carrierId_category_idx" ON "carrier_attachments"("carrierId", "category");

-- CreateIndex
CREATE INDEX "driver_attachments_driverId_category_idx" ON "driver_attachments"("driverId", "category");

-- AddForeignKey
ALTER TABLE "carrier_attachments" ADD CONSTRAINT "carrier_attachments_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "carriers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carrier_attachments" ADD CONSTRAINT "carrier_attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_attachments" ADD CONSTRAINT "driver_attachments_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_attachments" ADD CONSTRAINT "driver_attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
