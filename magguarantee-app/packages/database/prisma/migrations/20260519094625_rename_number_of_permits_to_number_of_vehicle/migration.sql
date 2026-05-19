/*
  Warnings:

  - You are about to drop the column `numberOfPermits` on the `carriers` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "carriers" RENAME COLUMN "numberOfPermits" TO "numberOfVehicle";
