-- Drop three unused entity fields (user-confirmed full removal — UI + API + DB):
--   * `vehicles.nextInspectionDate` (DATE, nullable) — NastepnyPrzeglad; next
--     technical-inspection date no longer tracked on the vehicle.
--   * `trailers.nextInspectionDate` (DATE, nullable) — next technical-inspection
--     date no longer tracked on the trailer.
--   * `vehicles.adrClasses` (TEXT[]) — ADR class list (CSV → array). The kept
--     `vehicles.adr` boolean (ADR permit flag) is a separate column and is
--     intentionally left intact, as are `drivers.adr`, `vehicles.wasteCountries`,
--     and the VehicleAttachment/DriverAttachment ADR certificate scans.
-- Existing values are lost (confirmed). No backfill — fields are being removed
-- from the product entirely.

-- AlterTable
ALTER TABLE "vehicles" DROP COLUMN "nextInspectionDate";

-- AlterTable
ALTER TABLE "vehicles" DROP COLUMN "adrClasses";

-- AlterTable
ALTER TABLE "trailers" DROP COLUMN "nextInspectionDate";
