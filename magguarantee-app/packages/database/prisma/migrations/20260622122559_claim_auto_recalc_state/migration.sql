-- REWORK 2026-06-20 (#4, docs/20 §0″) — explicit auto-recalc result on Claim.
--
-- Adds `claims.autoRecalcState` (enum ClaimAutoRecalcState) so the frontend can
-- read the outcome of the period auto-recalc directly instead of inferring it
-- heuristically. Same slice as `delegationId` / `periodAdjustedByVerifier`
-- (migration 20260622105359_phase7_claim_delegation_link).
--
--   none    — no recalc event yet (default).
--   applied — auto-recalc ran when the delegation reached `zjechal`.
--   skipped — recalc was due (real divergence between the submitted period and
--             the delegation's actual dates) but suppressed because the wniosek
--             was already decided OR the period had been adjusted by a human.
-- The api owns the writes; the DB only provides the column + default.
--
-- Forward-only: the DB is greenfield (empty + seed-only, never in production per
-- CLAUDE.md). The new column is NOT NULL DEFAULT 'none', so any existing/seed
-- rows are backfilled to `none` automatically — no data migration needed.

-- CreateEnum
CREATE TYPE "ClaimAutoRecalcState" AS ENUM ('none', 'applied', 'skipped');

-- AlterTable
ALTER TABLE "claims" ADD COLUMN     "autoRecalcState" "ClaimAutoRecalcState" NOT NULL DEFAULT 'none';
