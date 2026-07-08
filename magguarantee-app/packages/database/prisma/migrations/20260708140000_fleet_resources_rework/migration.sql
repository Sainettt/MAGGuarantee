-- CreateEnum
CREATE TYPE "WasteCountry" AS ENUM ('DE', 'NL', 'AT', 'BE', 'LUX', 'FR', 'GB', 'IT', 'CZ', 'PL');

-- CreateEnum
CREATE TYPE "DriverNationality" AS ENUM ('BY', 'RUS', 'UA', 'PL', 'UZB', 'KRG', 'KZ', 'OTHER');

-- CreateEnum
CREATE TYPE "DriverLanguage" AS ENUM ('PL', 'RU', 'EN', 'UA', 'DE', 'OTHER');

-- CreateEnum
CREATE TYPE "TrailerAttachmentCategory" AS ENUM ('cert_xl');

-- AlterEnum
BEGIN;
CREATE TYPE "EuroNorm_new" AS ENUM ('VI');
ALTER TABLE "vehicles" ALTER COLUMN "euro" TYPE "EuroNorm_new" USING ("euro"::text::"EuroNorm_new");
ALTER TYPE "EuroNorm" RENAME TO "EuroNorm_old";
ALTER TYPE "EuroNorm_new" RENAME TO "EuroNorm";
DROP TYPE "EuroNorm_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "VehicleAttachmentCategory_new" AS ENUM ('contract', 'gps', 'agreement', 'cabotage_de', 'cabotage_de_insurance');
ALTER TABLE "vehicle_attachments" ALTER COLUMN "category" TYPE "VehicleAttachmentCategory_new" USING ("category"::text::"VehicleAttachmentCategory_new");
ALTER TYPE "VehicleAttachmentCategory" RENAME TO "VehicleAttachmentCategory_old";
ALTER TYPE "VehicleAttachmentCategory_new" RENAME TO "VehicleAttachmentCategory";
DROP TYPE "VehicleAttachmentCategory_old";
COMMIT;

-- AlterTable
ALTER TABLE "drivers" ADD COLUMN     "adrClasses" TEXT[],
ADD COLUMN     "languages" "DriverLanguage"[],
ADD COLUMN     "nationality" "DriverNationality" NOT NULL;

-- AlterTable
ALTER TABLE "trailers" DROP COLUMN "airSuspension",
ADD COLUMN     "beams" BOOLEAN,
ADD COLUMN     "beamsCount" INTEGER,
ADD COLUMN     "edscha" BOOLEAN,
ADD COLUMN     "liftingRoof" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "palletBox" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sideClearanceCm" INTEGER NOT NULL,
ADD COLUMN     "slidingRoof" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "adrClasses" TEXT[],
ADD COLUMN     "fuelCardExpiry" DATE,
ADD COLUMN     "fuelCardNumber" TEXT,
ADD COLUMN     "fuelCardPin" TEXT,
ALTER COLUMN "euro" SET DEFAULT 'VI',
DROP COLUMN "wasteCountries",
ADD COLUMN     "wasteCountries" "WasteCountry"[],
ALTER COLUMN "gpsMobilePhone" DROP NOT NULL;

-- CreateTable
CREATE TABLE "trailer_attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trailerId" UUID NOT NULL,
    "category" "TrailerAttachmentCategory" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "trailer_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trailer_attachments_trailerId_category_idx" ON "trailer_attachments"("trailerId", "category");

-- AddForeignKey
ALTER TABLE "trailer_attachments" ADD CONSTRAINT "trailer_attachments_trailerId_fkey" FOREIGN KEY ("trailerId") REFERENCES "trailers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trailer_attachments" ADD CONSTRAINT "trailer_attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

