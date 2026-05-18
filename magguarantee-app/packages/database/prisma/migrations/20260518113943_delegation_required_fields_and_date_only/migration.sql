-- ─── Hard wipe of delegations ──────────────────────────────
-- 2026-05 product decision: driverId / trailerId / plannedReturnAt /
-- returnCountry / returnPostalCode become NOT NULL at submit. Legacy rows
-- created before this change carried NULLs in these columns, so SET NOT NULL
-- would fail. No backfill path is meaningful (the fields are user-supplied
-- planning data, not derivable from existing rows), and delegations are still
-- pre-prod fixture data only. User confirmed wipe + reseed.
--
-- No inbound FKs reference delegations(id), so CASCADE is just defensive
-- (verified via pg_constraint). RESTART IDENTITY is a no-op for UUID PKs but
-- documents intent.
TRUNCATE TABLE "delegations" RESTART IDENTITY CASCADE;

-- ─── Drop status-conditional CHECK (now unconditional) ─────
-- delegation_returned_complete (introduced in 20260507195536_phase3_blocks_audit_revert)
-- conditionally required actualReturnAt + returnCountry + returnPostalCode
-- only when status='zjechal'. After this migration returnCountry and
-- returnPostalCode are unconditionally NOT NULL at the column level, and the
-- only status-conditional bit left would be actualReturnAt — which we keep
-- nullable (it's set on the markReturned transition, not at submit). API
-- layer enforces "actualReturnAt set when status=zjechal".
ALTER TABLE "delegations" DROP CONSTRAINT "delegation_returned_complete";

-- ─── FK re-creation prep ───────────────────────────────────
-- Prisma's diff requires recreating the trailerId/driverId FKs because the
-- nullability changes — drop them here, add them back at the end.
ALTER TABLE "delegations" DROP CONSTRAINT "delegations_driverId_fkey";
ALTER TABLE "delegations" DROP CONSTRAINT "delegations_trailerId_fkey";

-- ─── NOT NULL + type changes ───────────────────────────────
-- plannedReturnAt: TIMESTAMP(3) → DATE. The driver doesn't commit to an hour
-- at submit, only a day. Existing rows would need a USING cast, but TRUNCATE
-- above already emptied the table so the implicit cast is moot.
ALTER TABLE "delegations" ALTER COLUMN "trailerId" SET NOT NULL,
ALTER COLUMN "driverId" SET NOT NULL,
ALTER COLUMN "plannedReturnAt" SET NOT NULL,
ALTER COLUMN "plannedReturnAt" SET DATA TYPE DATE USING "plannedReturnAt"::date,
ALTER COLUMN "returnCountry" SET NOT NULL,
ALTER COLUMN "returnPostalCode" SET NOT NULL;

-- ─── Length / format CHECKs ────────────────────────────────
-- Country code: 2..8 chars covers ISO 3166-1 alpha-2 (PL, DE, ...) including
-- the VIES-specific Greek code `EL` (instead of `GR`), and leaves headroom
-- for short legacy region strings if they ever surface. Format validation
-- (uppercase alpha) lives in the shared Zod schema, not at the DB level.
ALTER TABLE "delegations"
  ADD CONSTRAINT "delegation_return_country_length"
  CHECK (char_length("returnCountry") BETWEEN 2 AND 8);

-- Postal code: ≤16 chars accommodates every EU format (PL `00-001` = 6,
-- NL `1234 AB` = 7, UK `SW1A 1AA` = 8, IE `D02 XY45` = 8, …). Country-
-- specific format checking lives in shared/eu-postal-codes.ts (Zod).
ALTER TABLE "delegations"
  ADD CONSTRAINT "delegation_return_postal_code_length"
  CHECK (char_length("returnPostalCode") <= 16);

-- ─── Re-add FKs with new NOT NULL columns ──────────────────
ALTER TABLE "delegations" ADD CONSTRAINT "delegations_trailerId_fkey" FOREIGN KEY ("trailerId") REFERENCES "trailers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "delegations" ADD CONSTRAINT "delegations_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
