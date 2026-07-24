-- Remove the MANUAL wniosek authorization flow (Step 1 of db → api → web).
--
-- Customer decision 2026-07-24: retire the HAND-DRIVEN "request authorization"
-- workflow on claims. The AUTOMATIC Maksim gate STAYS and is now the sole
-- authorization path — the maksimGate* columns and
-- ClaimAttachmentCategory.AUTORYZACJA_MAKSIMA are UNTOUCHED. From now on the api
-- itself moves an over-threshold, verified claim into status
-- 'OCZEKUJE NA AUTORYZACJĘ' (that enum value is KEPT), instead of the old
-- token/description request flow. The parallel "kwota Maksima" concept
-- (amountMaximum + the 'AUTORYZACJA — KWOTA MAKSIMA' status) is retired entirely.
--
-- This migration:
--   1. Drops 7 now-dead columns on "claims":
--        authorizationRequired / authorizationDescription / authorizationToken /
--        authorizationDecidedAt — the manual request-authorization flow;
--        margin                 — its only writer was the removed manual PATCH branch;
--        amountMaximum          — "kwota Maksima" override; the whole concept is gone;
--        authScreenshotUrl      — dead since Phase 4.2 (see the header note of
--                                 20260708120000_maksim_authorization_gate, which
--                                 deferred this drop); swept up here.
--   2. Removes the unreachable enum value 'AUTORYZACJA — KWOTA MAKSIMA' from
--      "ClaimStatus". Postgres cannot DROP an enum value in place, so the type is
--      recreated with the surviving 5 values. Both columns typed "ClaimStatus"
--      (claims.status + claims.statusBeforeReklamacja) are re-pointed at it.
--
-- Forward-only: the DB is greenfield (empty + seed-only, never in production per
-- CLAUDE.md). No down migration. No backfill needed — no row can hold the dropped
-- enum value (nothing ever set 'AUTORYZACJA — KWOTA MAKSIMA').

-- ── 1. Drop the dead authorization / kwota-Maksima / margin columns ─────────
-- None of these participate in any index, FK or CHECK, so plain DROP COLUMN is safe.
ALTER TABLE "claims" DROP COLUMN "authorizationRequired";
ALTER TABLE "claims" DROP COLUMN "authorizationDescription";
ALTER TABLE "claims" DROP COLUMN "authorizationToken";
ALTER TABLE "claims" DROP COLUMN "authorizationDecidedAt";
ALTER TABLE "claims" DROP COLUMN "margin";
ALTER TABLE "claims" DROP COLUMN "amountMaximum";
ALTER TABLE "claims" DROP COLUMN "authScreenshotUrl";

-- ── 2. Rebuild "ClaimStatus" without 'AUTORYZACJA — KWOTA MAKSIMA' ──────────
-- Postgres refuses ALTER TYPE on an enum used by a column that is referenced in a
-- CHECK constraint, and refuses a straight column-type swap while a DEFAULT is
-- attached. So: drop the CHECK + the status DEFAULT, recreate the type, re-cast
-- both ClaimStatus columns, then restore the DEFAULT and the CHECK verbatim.

-- 2a. Drop the CHECK that references claims.status (recreated unchanged in 2g).
--     Body is identical to 20260507191424_phase3_blocks.
ALTER TABLE "claims" DROP CONSTRAINT "claim_accepted_payment_complete";

-- 2b. Drop the DEFAULT on claims.status (otherwise the USING cast below fails).
ALTER TABLE "claims" ALTER COLUMN "status" DROP DEFAULT;

-- 2c. Recreate the enum with the surviving 5 values, in the ORIGINAL order and
--     with the same @map strings (note the Unicode 'Ę' in 'OCZEKUJE NA AUTORYZACJĘ').
CREATE TYPE "ClaimStatus_new" AS ENUM (
  'NA WERYFIKACJI',
  'ZAAKCEPTOWANO',
  'ODRZUCONO',
  'REKLAMACJA',
  'OCZEKUJE NA AUTORYZACJĘ'
);

-- 2d. Re-point BOTH columns typed "ClaimStatus" at the new type.
ALTER TABLE "claims"
  ALTER COLUMN "status" TYPE "ClaimStatus_new"
    USING ("status"::text::"ClaimStatus_new");
ALTER TABLE "claims"
  ALTER COLUMN "statusBeforeReklamacja" TYPE "ClaimStatus_new"
    USING ("statusBeforeReklamacja"::text::"ClaimStatus_new");

-- 2e. Swap the type names.
DROP TYPE "ClaimStatus";
ALTER TYPE "ClaimStatus_new" RENAME TO "ClaimStatus";

-- 2f. Restore the DEFAULT on claims.status.
ALTER TABLE "claims" ALTER COLUMN "status" SET DEFAULT 'NA WERYFIKACJI';

-- 2g. Restore the CHECK verbatim (body identical to 20260507191424_phase3_blocks):
--     a ZAAKCEPTOWANO claim must carry a non-empty orderNumber, an orderDate and
--     an amountApproved.
ALTER TABLE "claims"
  ADD CONSTRAINT "claim_accepted_payment_complete"
  CHECK (
    status != 'ZAAKCEPTOWANO'
    OR (
      "orderNumber" IS NOT NULL
      AND "orderNumber" != ''
      AND "orderDate" IS NOT NULL
      AND "amountApproved" IS NOT NULL
    )
  );
