-- Immutable carrier-submission snapshots of the declared time window.
-- `origTimeFrom`/`origTimeTo` mirror `timeFrom`/`timeTo` (HH:MM legacy strings)
-- and are written once at submit; the verifier (pracownik) PATCH never mutates
-- them. They power the History tab + audit-trail diff detection, exactly like
-- `origDateStart`/`origDateEnd`/`origMileage`. Nullable: NULL means "no snapshot"
-- (legacy/unset rows). DB is seed-only per CLAUDE.md — no back-fill needed.

-- AlterTable
ALTER TABLE "claims" ADD COLUMN     "origTimeFrom" TEXT,
ADD COLUMN     "origTimeTo" TEXT;
