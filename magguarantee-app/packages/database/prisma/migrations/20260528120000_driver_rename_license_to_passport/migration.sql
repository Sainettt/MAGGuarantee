-- Phase 5+ — repurpose Driver.driverLicenseNumber as a passport-number column.
--
-- The field's semantics flipped: we no longer store the driving-license number
-- here (the licence is implicitly required to drive, but its number wasn't
-- adding business value), we store the passport number used during cross-border
-- delegations. The column type, nullability, and column-name casing don't
-- change — we only rename in place so existing rows retain their value (the
-- assumption per business sign-off is that whatever was previously typed into
-- the "Nr prawa jazdy" field is acceptable as a passport-number string).
--
-- See `Driver` block in schema.prisma for the corresponding model rename.

ALTER TABLE "drivers" RENAME COLUMN "driverLicenseNumber" TO "passportNumber";
