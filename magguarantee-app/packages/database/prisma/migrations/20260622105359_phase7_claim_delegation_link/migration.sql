-- Phase 7 (REWORK 2026-06-20 #4, see docs/20 §0″) — statuses operational again
-- + the wniosek↔wyjazd link.
--
-- Three changes:
--   1. DelegationStatus gains `gotowy` (between `zgloszony` and `w_trasie`) —
--      the status eksport sets after finding a load and placing the zlecenie.
--   2. claims.delegationId — FK → delegations, UNIQUE (one claim per delegation).
--      Nullable in the DB (legacy/migration); "required for new claims" is an
--      app-level rule, not a DB constraint. Period (dateStart/dateEnd) and
--      mileage are derived from the delegation.
--   3. claims.periodAdjustedByVerifier — marks that a pracownik edited the
--      claim period; gates the auto-recalc when the delegation later reaches
--      `zjechal`.
--
-- Forward-only: the DB is greenfield (empty + seed-only, never in production per
-- CLAUDE.md), so there are no existing claim rows whose delegationId must be
-- backfilled. The new enum value is NOT referenced by any other statement in
-- this migration, so the ALTER TYPE is safe alongside the table changes.

-- AlterEnum
ALTER TYPE "DelegationStatus" ADD VALUE 'gotowy';

-- AlterTable
ALTER TABLE "claims" ADD COLUMN     "delegationId" UUID,
ADD COLUMN     "periodAdjustedByVerifier" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "claims_delegationId_key" ON "claims"("delegationId");

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_delegationId_fkey" FOREIGN KEY ("delegationId") REFERENCES "delegations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
