-- ─── Carrier onboarding status ─────────────────────────────
-- 2026-05 product decision: introduce a display-only progress marker on
-- Carrier to power the guided onboarding wizard
-- (Carrier → Vehicle → Trailer → Driver). No access gating or business
-- rule depends on it — purely an "incomplete" badge + resume-from-step
-- hint in the admin/opiekun UI.
--
-- The column defaults to PENDING_VEHICLE so freshly-created carriers
-- land at step 1 of the wizard. Existing carrier rows are then
-- backfilled to COMPLETE in this same migration — user decision:
-- legacy/seed carriers are considered fully set up regardless of
-- whether they actually have vehicles/trailers/drivers attached. Only
-- fresh production-side creations from this point forward will surface
-- a non-COMPLETE status.
--
-- No index is added: carrier row count is in the low hundreds at most
-- for an internal MAGTRANS deployment, the dominant filter on
-- GET /carriers is already `deletedAt IS NULL` (existing index), and a
-- 4-value enum heavily skewed toward COMPLETE wouldn't materially
-- improve query plans here. Revisit if row count grows beyond ~10k or
-- if profile shows seq-scan latency.

-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('PENDING_VEHICLE', 'PENDING_TRAILER', 'PENDING_DRIVER', 'COMPLETE');

-- AlterTable
ALTER TABLE "carriers" ADD COLUMN "onboardingStatus" "OnboardingStatus" NOT NULL DEFAULT 'PENDING_VEHICLE';

-- Backfill: every pre-existing carrier row is considered fully onboarded.
-- New inserts continue to land at PENDING_VEHICLE via the column DEFAULT.
UPDATE "carriers" SET "onboardingStatus" = 'COMPLETE';
