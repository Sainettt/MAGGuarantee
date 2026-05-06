-- Phase 3 hot-path indexes.
--
-- Rationale (see docs/12-database-schema.md "Индексы — стратегия" and
-- docs/13-api-design.md):
--
-- 1) claims(carrierId, deletedAt) — covers carrier-panel "list my claims"
--    queries that filter by deletedAt IS NULL and may not include a status
--    filter. The existing claims(carrierId, status) covers status-filtered
--    reads but cannot be used as efficiently when no status predicate is
--    supplied and the planner has to apply the deletedAt filter.
--
-- 2) delegations(carrierId, deletedAt, status) — same rationale for the
--    carrier delegations list. Existing delegations(carrierId, status) is
--    kept (used by admin/opiekun/eksport queries that don't go through the
--    soft-delete middleware).
--
-- claim_sequences PK is already (yearMonth) — atomic NrZgl upsert path is
-- covered, no change needed.

-- CreateIndex
CREATE INDEX "claims_carrierId_deletedAt_idx" ON "claims"("carrierId", "deletedAt");

-- CreateIndex
CREATE INDEX "delegations_carrierId_deletedAt_status_idx" ON "delegations"("carrierId", "deletedAt", "status");
