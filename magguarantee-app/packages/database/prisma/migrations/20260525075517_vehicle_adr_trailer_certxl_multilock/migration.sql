-- AlterEnum
ALTER TYPE "VehicleAttachmentCategory" ADD VALUE 'adr';

-- AlterTable
ALTER TABLE "trailers" ADD COLUMN     "certXl" BOOLEAN,
ADD COLUMN     "multilock" BOOLEAN;

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "adr" BOOLEAN NOT NULL DEFAULT false;
