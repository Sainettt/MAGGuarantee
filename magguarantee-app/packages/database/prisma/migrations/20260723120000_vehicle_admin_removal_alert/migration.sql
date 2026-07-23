-- Admin-removal alert dedup state for the delegation-driven idle escalation.
--
-- Vehicle operational status is DERIVED at read time from delegations, NOT
-- stored: `aktywna` when a non-terminal delegation exists (zgloszony/gotowy/
-- w_trasie); otherwise anchor = max(Delegation.actualReturnAt over zjechal,
-- non-deleted) ?? Vehicle.createdAt, and daysSinceReturn (CALENDAR days from
-- anchor to today) buckets into stojąca 0–14 / nieaktywna 15–28 /
-- do_usunięcia ≥29. There is intentionally NO status/bucket column.
--
-- These two columns are the ONLY persisted state for the flow. A daily cron
-- emails all active admins about every vehicle at daysSinceReturn ≥ 29
-- (ALL vehicles, not only guaranteed), repeating once every 3 calendar days:
--   * adminRemovalNotifiedAt — timestamp of the LAST removal email sent for
--     this vehicle. NULL = never notified / reset. Cron sends when
--     daysSinceReturn ≥ 29 AND (adminRemovalNotifiedAt IS NULL OR
--     now - adminRemovalNotifiedAt ≥ 3 days), then stamps it = now; and
--     CLEARS it back to NULL once the vehicle leaves the ≥29 state (new
--     delegation, etc.) so a later relapse re-triggers cleanly.
--   * adminRemovalNotifyCount — lifetime running count of removal emails sent
--     for this vehicle (observability/audit). Incremented on every send; NOT
--     reset when adminRemovalNotifiedAt is cleared.
--
-- Both are additive: nullable timestamp backfills to NULL, count defaults to 0.
-- No data loss. Physical table is `vehicles` (Vehicle @@map).

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "adminRemovalNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "adminRemovalNotifyCount" INTEGER NOT NULL DEFAULT 0;
