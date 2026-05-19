-- ─── Drop Carrier.onboardingStatus + OnboardingStatus enum ─────────────
-- 2026-05 reversal of 20260519095752_carrier_onboarding_status. The column
-- was lying when entities are created out-of-order (e.g. driver first, then
-- vehicle), and the wizard now derives progress from the presence of
-- Vehicle / Trailer / Driver rows directly. No business rule ever depended
-- on this column — it was display-only — so there is no backfill and no
-- data preservation.
--
-- Order matters in PostgreSQL: drop the column BEFORE the type, otherwise
-- the type is still referenced and DROP TYPE fails.

-- AlterTable
ALTER TABLE "carriers" DROP COLUMN "onboardingStatus";

-- DropEnum
DROP TYPE "OnboardingStatus";
