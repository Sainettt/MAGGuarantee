/*
  Warnings:

  - Made the column `amountRequested` on table `claims` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "carriers" ALTER COLUMN "insuranceValue" DROP NOT NULL,
ALTER COLUMN "insuranceExpiry" DROP NOT NULL,
ALTER COLUMN "licenseExpiry" DROP NOT NULL;

-- AlterTable
ALTER TABLE "claims" ALTER COLUMN "amountRequested" SET NOT NULL;

-- AlterTable
ALTER TABLE "delegations" ALTER COLUMN "plannedReturnAt" DROP NOT NULL,
ALTER COLUMN "returnCountry" DROP NOT NULL,
ALTER COLUMN "returnPostalCode" DROP NOT NULL;

-- AlterTable
ALTER TABLE "drivers" ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "licenseExpiry" DROP NOT NULL,
ALTER COLUMN "bankAccount" DROP NOT NULL;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- AlterTable
ALTER TABLE "vehicles" ALTER COLUMN "rateDe" DROP NOT NULL,
ALTER COLUMN "rateUe" DROP NOT NULL,
ALTER COLUMN "rateExport" DROP NOT NULL,
ALTER COLUMN "rateImport" DROP NOT NULL;

-- Status-conditional NOT NULL: a delegation marked as returned (zjechal)
-- must have actualReturnAt + return location filled in. Mirrors the
-- claim_accepted_payment_complete pattern from phase3_blocks.
ALTER TABLE "delegations"
  ADD CONSTRAINT "delegation_returned_complete"
  CHECK (
    status != 'zjechal'
    OR (
      "actualReturnAt" IS NOT NULL
      AND "returnCountry" IS NOT NULL
      AND "returnCountry" != ''
      AND "returnPostalCode" IS NOT NULL
      AND "returnPostalCode" != ''
    )
  );
