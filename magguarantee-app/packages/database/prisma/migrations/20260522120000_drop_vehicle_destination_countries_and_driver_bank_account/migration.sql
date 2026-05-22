-- Drop two unused entity fields (user-approved data loss):
--   * `vehicles.destinationCountries` (TEXT[]) — destination-country list
--     removed from the Vehicle modal. `vehicles.wasteCountries` is a separate
--     column and is intentionally left intact.
--   * `drivers.bankAccount` (TEXT, nullable) — carrier-internal HR field no
--     longer tracked in MAGGuarantee.

-- AlterTable
ALTER TABLE "vehicles" DROP COLUMN "destinationCountries";

-- AlterTable
ALTER TABLE "drivers" DROP COLUMN "bankAccount";
