/*
  Warnings:

  - Made the column `nip` on table `carriers` required. This step will fail if there are existing NULL values in that column.
  - Made the column `vatId` on table `carriers` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "carriers" ALTER COLUMN "nip" SET NOT NULL,
ALTER COLUMN "vatId" SET NOT NULL;
