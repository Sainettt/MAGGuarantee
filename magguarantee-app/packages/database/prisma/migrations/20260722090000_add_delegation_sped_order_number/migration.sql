-- Nr zlecenia ze spedu — the spedition/forwarding order number captured when an
-- outing is marked `gotowy` (ready). Stamped in DelegationsService.markReady on the
-- forward flip (zgloszony → gotowy), alongside readyById/readyAt; NULL until then.
-- Nullable, no default -> backfills existing rows to NULL. Additive, no data loss.
-- Physical table is `delegations` (Delegation @@map).

-- AlterTable
ALTER TABLE "delegations" ADD COLUMN "spedOrderNumber" TEXT;
