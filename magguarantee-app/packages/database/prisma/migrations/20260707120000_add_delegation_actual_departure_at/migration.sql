-- Departure-side analogue of `actualReturnAt`. Set by the weryfikator on the
-- transition to `w_trasie` (in transit) to record the actual date driving
-- started. Nullable, NOT `@db.Date` — a date-only value stored as UTC midnight,
-- flipped together with `status` inside a single service transaction (same
-- pattern as `actualReturnAt`), so there is no DB CHECK enforcing presence.
--
-- Forward-only, no back-fill: the DB is greenfield (empty + seed-only, never in
-- production per CLAUDE.md). The column is nullable, so existing/seed rows keep
-- NULL — no data migration needed.

-- AlterTable
ALTER TABLE "delegations" ADD COLUMN     "actualDepartureAt" TIMESTAMP(3);
