-- Maksim authorization gate (Step 1 of db → api → web).
-- When a verifier saves a claim verification and the compensation exceeds the
-- threshold on an already-verified claim, the accept/reject decision is BLOCKED
-- until the verifier uploads a screenshot of Maksim's out-of-band confirmation.
-- This migration adds:
--   1. The maksimGate* gate state on `claims` (SEPARATE from the existing
--      `authorizationRequired` OCZEKUJE_NA_AUTORYZACJE manual flow — untouched).
--   2. A `category` on `claim_attachments` to distinguish the confirmation
--      screenshot (AUTORYZACJA_MAKSIMA) from regular wniosek files (WNIOSEK).
--
-- The `category` column is added NOT NULL DEFAULT 'WNIOSEK', so every existing
-- row is backfilled to WNIOSEK by the column default (Postgres applies the
-- default to pre-existing rows on ADD COLUMN). No-op on a greenfield DB.
--
-- The dead `claims.authScreenshotUrl` field is intentionally NOT dropped here —
-- it is still referenced by the api + shared layers (claims.repository.ts,
-- claims.service.ts, shared/schemas/claims.ts). Removing it is deferred to a
-- coordinated cleanup with api-agent.
--
-- Forward-only: the DB is greenfield (empty + seed-only, never in production per
-- CLAUDE.md). No down migration.

-- CreateEnum
CREATE TYPE "ClaimAttachmentCategory" AS ENUM ('WNIOSEK', 'AUTORYZACJA_MAKSIMA');

-- AlterTable
ALTER TABLE "claim_attachments" ADD COLUMN     "category" "ClaimAttachmentCategory" NOT NULL DEFAULT 'WNIOSEK';

-- AlterTable
ALTER TABLE "claims" ADD COLUMN     "maksimGateClearedAt" TIMESTAMP(3),
ADD COLUMN     "maksimGateClearedById" UUID,
ADD COLUMN     "maksimGateNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "maksimGateRequired" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_maksimGateClearedById_fkey" FOREIGN KEY ("maksimGateClearedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
