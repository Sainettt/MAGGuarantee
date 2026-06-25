-- Phase 7 follow-up — record the eksport who marked an outing `gotowy` (ready).
-- Surfaced in the delegation modal as the "zweryfikowany" actor (in MAGTRANS the
-- export coordinator readying the load IS the verification step). Stamped in
-- DelegationsService.markReady on the forward flip; NULL until then.

-- AlterTable
ALTER TABLE "delegations" ADD COLUMN "readyById" UUID;
ALTER TABLE "delegations" ADD COLUMN "readyAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "delegations" ADD CONSTRAINT "delegations_readyById_fkey" FOREIGN KEY ("readyById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
