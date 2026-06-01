-- Phase 5+ — generalise Driver.passportNumber into a generic identity-document column.
--
-- The field stored a passport number, but in practice a driver may present any
-- identity document during cross-border delegations (passport, national ID card
-- / dowód osobisty, etc.). We rename the column to `idDocumentNumber` to reflect
-- that broader meaning. The column type, nullability, and column-name casing
-- don't change — we only rename in place so existing rows retain their value.
--
-- See `Driver` block in schema.prisma for the corresponding model rename.

ALTER TABLE "drivers" RENAME COLUMN "passportNumber" TO "idDocumentNumber";
