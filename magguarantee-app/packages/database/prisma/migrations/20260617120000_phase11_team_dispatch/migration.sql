-- Phase 11 — Шаг D: introduce the `Team` (dispatch team) entity and move the
-- dispatch side of a Vehicle from a single user (`Vehicle.dispatcherId`) to a
-- team (`Vehicle.dispatchTeamId`). Dispatchers now belong to a team via
-- `User.teamId`.
--
-- Forward-only / destructive: the DB is greenfield (seed-only, never in
-- production), so the legacy `vehicles.dispatcherId` FK + column + index are
-- DROPPED outright — no down-migration, no backfill (there is no real dispatch
-- data to preserve). `planista` assignment (`vehicles.plannerId`) is untouched.
--
-- Both new FKs use `ON DELETE SET NULL` (nullable optional relations): deleting
-- a Team detaches its users/vehicles rather than cascading. Hard-deleting a
-- referenced Team is additionally guarded at the API layer. `Team` uses an
-- `active` flag (NOT a `deletedAt` soft-delete) — admin keeps a small curated
-- catalog (see docs/04-data-model.md «Team»).
--
-- Operation order: DROP old FK → DROP old index → DROP/ADD columns →
-- CREATE teams table → CREATE indexes → ADD new FKs.

-- DropForeignKey
ALTER TABLE "vehicles" DROP CONSTRAINT "vehicles_dispatcherId_fkey";

-- DropIndex
DROP INDEX "vehicles_dispatcherId_idx";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "teamId" UUID;

-- AlterTable
ALTER TABLE "vehicles" DROP COLUMN "dispatcherId",
ADD COLUMN     "dispatchTeamId" UUID;

-- CreateTable
CREATE TABLE "teams" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "teams_code_key" ON "teams"("code");

-- CreateIndex
CREATE INDEX "users_teamId_idx" ON "users"("teamId");

-- CreateIndex
CREATE INDEX "vehicles_dispatchTeamId_idx" ON "vehicles"("dispatchTeamId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_dispatchTeamId_fkey" FOREIGN KEY ("dispatchTeamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
