/*
  Warnings:

  - Made the column `contactPerson` on table `carriers` required. This step will fail if there are existing NULL values in that column.
  - Made the column `ordersEmail` on table `carriers` required. This step will fail if there are existing NULL values in that column.
  - Made the column `accountEur` on table `carriers` required. This step will fail if there are existing NULL values in that column.
  - Made the column `paymentTerms` on table `carriers` required. This step will fail if there are existing NULL values in that column.
  - Made the column `insuranceValue` on table `carriers` required. This step will fail if there are existing NULL values in that column.
  - Made the column `insuranceExpiry` on table `carriers` required. This step will fail if there are existing NULL values in that column.
  - Made the column `licenseExpiry` on table `carriers` required. This step will fail if there are existing NULL values in that column.
  - Made the column `companyAddress` on table `carriers` required. This step will fail if there are existing NULL values in that column.
  - Made the column `timeFrom` on table `claims` required. This step will fail if there are existing NULL values in that column.
  - Made the column `timeTo` on table `claims` required. This step will fail if there are existing NULL values in that column.
  - Made the column `drivenDays` on table `claims` required. This step will fail if there are existing NULL values in that column.
  - Made the column `mileage` on table `claims` required. This step will fail if there are existing NULL values in that column.
  - Made the column `kmPerDay` on table `claims` required. This step will fail if there are existing NULL values in that column.
  - Made the column `kmGuaranteed` on table `claims` required. This step will fail if there are existing NULL values in that column.
  - Made the column `kmDifference` on table `claims` required. This step will fail if there are existing NULL values in that column.
  - Made the column `paymentEur` on table `claims` required. This step will fail if there are existing NULL values in that column.
  - Made the column `ratePerKmEffective` on table `claims` required. This step will fail if there are existing NULL values in that column.
  - Made the column `departureCountry` on table `delegations` required. This step will fail if there are existing NULL values in that column.
  - Made the column `departurePostalCode` on table `delegations` required. This step will fail if there are existing NULL values in that column.
  - Made the column `plannedReturnAt` on table `delegations` required. This step will fail if there are existing NULL values in that column.
  - Made the column `returnCountry` on table `delegations` required. This step will fail if there are existing NULL values in that column.
  - Made the column `returnPostalCode` on table `delegations` required. This step will fail if there are existing NULL values in that column.
  - Made the column `email` on table `drivers` required. This step will fail if there are existing NULL values in that column.
  - Made the column `licenseExpiry` on table `drivers` required. This step will fail if there are existing NULL values in that column.
  - Made the column `bankAccount` on table `drivers` required. This step will fail if there are existing NULL values in that column.
  - Made the column `email` on table `users` required. This step will fail if there are existing NULL values in that column.
  - Made the column `passwordHash` on table `users` required. This step will fail if there are existing NULL values in that column.
  - Made the column `certificateL` on table `vehicles` required. This step will fail if there are existing NULL values in that column.
  - Made the column `euro` on table `vehicles` required. This step will fail if there are existing NULL values in that column.
  - Made the column `type` on table `vehicles` required. This step will fail if there are existing NULL values in that column.
  - Made the column `rateDe` on table `vehicles` required. This step will fail if there are existing NULL values in that column.
  - Made the column `rateUe` on table `vehicles` required. This step will fail if there are existing NULL values in that column.
  - Made the column `rateExport` on table `vehicles` required. This step will fail if there are existing NULL values in that column.
  - Made the column `rateImport` on table `vehicles` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "carriers" ALTER COLUMN "contactPerson" SET NOT NULL,
ALTER COLUMN "ordersEmail" SET NOT NULL,
ALTER COLUMN "accountEur" SET NOT NULL,
ALTER COLUMN "paymentTerms" SET NOT NULL,
ALTER COLUMN "paymentTerms" SET DEFAULT 30,
ALTER COLUMN "insuranceValue" SET NOT NULL,
ALTER COLUMN "insuranceExpiry" SET NOT NULL,
ALTER COLUMN "licenseExpiry" SET NOT NULL,
ALTER COLUMN "companyAddress" SET NOT NULL;

-- AlterTable
ALTER TABLE "claims" ALTER COLUMN "timeFrom" SET NOT NULL,
ALTER COLUMN "timeTo" SET NOT NULL,
ALTER COLUMN "drivenDays" SET NOT NULL,
ALTER COLUMN "mileage" SET NOT NULL,
ALTER COLUMN "kmPerDay" SET NOT NULL,
ALTER COLUMN "kmGuaranteed" SET NOT NULL,
ALTER COLUMN "kmDifference" SET NOT NULL,
ALTER COLUMN "paymentEur" SET NOT NULL,
ALTER COLUMN "ratePerKmEffective" SET NOT NULL;

-- AlterTable
ALTER TABLE "delegations" ALTER COLUMN "departureCountry" SET NOT NULL,
ALTER COLUMN "departurePostalCode" SET NOT NULL,
ALTER COLUMN "plannedReturnAt" SET NOT NULL,
ALTER COLUMN "returnCountry" SET NOT NULL,
ALTER COLUMN "returnPostalCode" SET NOT NULL;

-- AlterTable
ALTER TABLE "drivers" ALTER COLUMN "email" SET NOT NULL,
ALTER COLUMN "licenseExpiry" SET NOT NULL,
ALTER COLUMN "bankAccount" SET NOT NULL;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL,
ALTER COLUMN "passwordHash" SET NOT NULL;

-- AlterTable
ALTER TABLE "vehicles" ALTER COLUMN "certificateL" SET NOT NULL,
ALTER COLUMN "euro" SET NOT NULL,
ALTER COLUMN "type" SET NOT NULL,
ALTER COLUMN "rateDe" SET NOT NULL,
ALTER COLUMN "rateUe" SET NOT NULL,
ALTER COLUMN "rateExport" SET NOT NULL,
ALTER COLUMN "rateImport" SET NOT NULL;

-- ─── Status-conditional CHECK on Claim ─────────────────────
-- A claim in status ZAAKCEPTOWANO must carry a non-empty orderNumber,
-- a non-null orderDate and a non-null amountApproved. The columns are
-- kept NULLable at the schema level because the row is created by the
-- carrier with status NA_WERYFIKACJI, before MAGTRANS has assigned an
-- order number — but transitioning to ZAAKCEPTOWANO is gated.
ALTER TABLE "claims"
  ADD CONSTRAINT "claim_accepted_payment_complete"
  CHECK (
    status != 'ZAAKCEPTOWANO'
    OR (
      "orderNumber" IS NOT NULL
      AND "orderNumber" != ''
      AND "orderDate" IS NOT NULL
      AND "amountApproved" IS NOT NULL
    )
  );

-- ─── Vehicle GPS device CHECK ──────────────────────────────
-- gpsMobilePhone (tracker device id) is meaningful only for trucks with
-- a GPS unit. The column is NULLable so non-GPS trucks need no
-- placeholder; the constraint enforces presence iff gps=true.
ALTER TABLE "vehicles"
  ADD CONSTRAINT "vehicle_gps_device_when_gps_on"
  CHECK (gps = false OR "gpsMobilePhone" IS NOT NULL);
