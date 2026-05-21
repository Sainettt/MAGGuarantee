-- Vehicle-modal feature: umowa/cabotage file uploads, EURO-norm restriction,
-- destination-countries field. DB is greenfield (seed creates no vehicles),
-- so dropping the EuroNorm III/IV values and the legacy `contract` column
-- is safe — no production rows depend on them.

-- CreateEnum
CREATE TYPE "VehicleAttachmentCategory" AS ENUM ('contract', 'cabotage_de', 'cabotage_fr');

-- AlterEnum
-- EuroNorm restricted to V/VI (was III/IV/V/VI). Recreate the type and
-- re-point the dependent column.
BEGIN;
CREATE TYPE "EuroNorm_new" AS ENUM ('V', 'VI');
ALTER TABLE "vehicles" ALTER COLUMN "euro" TYPE "EuroNorm_new" USING ("euro"::text::"EuroNorm_new");
ALTER TYPE "EuroNorm" RENAME TO "EuroNorm_old";
ALTER TYPE "EuroNorm_new" RENAME TO "EuroNorm";
DROP TYPE "EuroNorm_old";
COMMIT;

-- AlterTable
-- Drop legacy `contract` (Umowa) boolean — the umowa scan is now stored as
-- VehicleAttachment rows with category=contract. Add destinationCountries.
ALTER TABLE "vehicles" DROP COLUMN "contract",
ADD COLUMN     "destinationCountries" TEXT[];

-- CreateTable
CREATE TABLE "vehicle_attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vehicleId" UUID NOT NULL,
    "category" "VehicleAttachmentCategory" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "vehicle_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vehicle_attachments_vehicleId_category_idx" ON "vehicle_attachments"("vehicleId", "category");

-- AddForeignKey
ALTER TABLE "vehicle_attachments" ADD CONSTRAINT "vehicle_attachments_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_attachments" ADD CONSTRAINT "vehicle_attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
