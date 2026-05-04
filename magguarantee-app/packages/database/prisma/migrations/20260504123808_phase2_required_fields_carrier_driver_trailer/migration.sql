/*
  Warnings:

  - Made the column `phone` on table `carriers` required. This step will fail if there are existing NULL values in that column.
  - Made the column `opiekunId` on table `carriers` required. This step will fail if there are existing NULL values in that column.
  - Made the column `phone` on table `drivers` required. This step will fail if there are existing NULL values in that column.
  - Made the column `driverLicenseNumber` on table `drivers` required. This step will fail if there are existing NULL values in that column.
  - Made the column `trailerTypeId` on table `trailers` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "carriers" DROP CONSTRAINT "carriers_opiekunId_fkey";

-- DropForeignKey
ALTER TABLE "trailers" DROP CONSTRAINT "trailers_trailerTypeId_fkey";

-- AlterTable
ALTER TABLE "carriers" ALTER COLUMN "phone" SET NOT NULL,
ALTER COLUMN "opiekunId" SET NOT NULL;

-- AlterTable
ALTER TABLE "drivers" ALTER COLUMN "phone" SET NOT NULL,
ALTER COLUMN "driverLicenseNumber" SET NOT NULL;

-- AlterTable
ALTER TABLE "trailers" ALTER COLUMN "trailerTypeId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "carriers" ADD CONSTRAINT "carriers_opiekunId_fkey" FOREIGN KEY ("opiekunId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trailers" ADD CONSTRAINT "trailers_trailerTypeId_fkey" FOREIGN KEY ("trailerTypeId") REFERENCES "trailer_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
