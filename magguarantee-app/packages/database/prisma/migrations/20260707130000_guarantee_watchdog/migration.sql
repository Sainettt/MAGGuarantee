-- Guarantee Watchdog (план 2026-07-07) — write-layer journal + guarantee-enable
-- anchor. A guaranteed vehicle (vehicles.agreement=true) must report a new
-- wyjazd within 10 Polish working days of its last return; this migration adds
-- the durable episode journal (used to dedup reminder emails and fix
-- violations) and the guarantee-enable date the API maintains on the agreement
-- toggle.
--
-- Forward-only: the DB is greenfield (empty + seed-only, never in production per
-- CLAUDE.md). No down migration. Two hand-added statements below the generated
-- DDL:
--   1. Partial unique index "one OPEN episode per vehicle" (state <> 'resolved')
--      — Prisma cannot express a partial unique in the schema DSL.
--   2. agreementSince backfill for already-guaranteed vehicles — a rollout
--      grace so existing guaranteed vehicles get a fresh 10-working-day window
--      from deploy day instead of a false immediate violation.

-- CreateEnum
CREATE TYPE "GuaranteeEpisodeState" AS ENUM ('warning', 'violated', 'resolved');

-- CreateEnum
CREATE TYPE "GuaranteeAnchorSource" AS ENUM ('zjechal', 'agreement');

-- CreateEnum
CREATE TYPE "GuaranteeResolveReason" AS ENUM ('wyjazd', 'agreement_off', 'vehicle_inactive');

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "agreementSince" DATE;

-- CreateTable
CREATE TABLE "guarantee_idle_episodes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vehicleId" UUID NOT NULL,
    "carrierId" UUID NOT NULL,
    "anchorAt" DATE NOT NULL,
    "anchorSource" "GuaranteeAnchorSource" NOT NULL,
    "deadlineAt" DATE NOT NULL,
    "state" "GuaranteeEpisodeState" NOT NULL,
    "reminder3SentAt" TIMESTAMP(3),
    "reminder1SentAt" TIMESTAMP(3),
    "violationSentAt" TIMESTAMP(3),
    "violatedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolvedByDelegationId" UUID,
    "resolvedDaysLeft" INTEGER,
    "resolvedReason" "GuaranteeResolveReason",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guarantee_idle_episodes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "guarantee_idle_episodes_carrierId_state_idx" ON "guarantee_idle_episodes"("carrierId", "state");

-- CreateIndex
CREATE INDEX "guarantee_idle_episodes_vehicleId_state_idx" ON "guarantee_idle_episodes"("vehicleId", "state");

-- AddForeignKey
ALTER TABLE "guarantee_idle_episodes" ADD CONSTRAINT "guarantee_idle_episodes_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guarantee_idle_episodes" ADD CONSTRAINT "guarantee_idle_episodes_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "carriers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guarantee_idle_episodes" ADD CONSTRAINT "guarantee_idle_episodes_resolvedByDelegationId_fkey" FOREIGN KEY ("resolvedByDelegationId") REFERENCES "delegations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── HAND-ADDED (not producible by the Prisma schema DSL) ───────────────

-- Partial unique index: at most ONE open (non-resolved) episode per vehicle.
-- Enforces the "one open episode per vehicle" invariant that the cron's
-- ensure-episode logic relies on. `resolved` rows are excluded, so a vehicle
-- may accumulate any number of closed episodes over time while never having two
-- open at once. Prisma has no DSL for partial uniques, hence the raw SQL.
CREATE UNIQUE INDEX "GuaranteeIdleEpisode_open_vehicle_key" ON "guarantee_idle_episodes"("vehicleId") WHERE "state" <> 'resolved';

-- Rollout grace: stamp agreementSince=today on every already-guaranteed vehicle
-- that has no value yet, so on the first watchdog run existing guaranteed
-- vehicles start a fresh 10-working-day window from deploy day (no false
-- immediate violations). No-op on an empty/greenfield DB. New toggles are
-- handled by the API going forward.
UPDATE "vehicles" SET "agreementSince" = CURRENT_DATE WHERE "agreement" = true AND "agreementSince" IS NULL;
