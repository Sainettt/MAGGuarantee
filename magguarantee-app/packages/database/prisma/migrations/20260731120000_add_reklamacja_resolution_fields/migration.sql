-- Reworked "reklamacje" feature (Step 1 of db → api → web).
--
-- Business semantics confirmed 2026-07-31: a carrier files exactly ONE
-- reklamacja per wniosek (one-shot flag `reklamacjaSubmitted`), only on a DECIDED
-- claim (ZAAKCEPTOWANO / ODRZUCONO), within 48h of `statusChangedAt`, for at most
-- `origPaymentEur - (amountApproved if ZAAKCEPTOWANO else 0)`. Pracownik/admin
-- then decide:
--   * UZNANA    — must supply a dedicated «nr zlecenia» (new `reklamacjaOrderNumber`);
--   * ODRZUCONA — must supply a justification (existing `reklamacjaResponse`).
--
-- The KEY modeling decision: the decision does NOT introduce new claim statuses.
-- On either outcome the claim's `status` returns to `statusBeforeReklamacja`
-- (both `REKLAMACJA → ZAAKCEPTOWANO` and `REKLAMACJA → ODRZUCONO` stay legal
-- state-machine edges; WHICH one is taken is dictated by `statusBeforeReklamacja`,
-- not by the outcome). An accepted reklamacja on a rejected wniosek must NOT turn
-- that wniosek into ZAAKCEPTOWANO — so the outcome lives in its own column
-- (`reklamacjaResolution`), never in "ClaimStatus".
--
-- Equally important: the wniosek's own payout fields (`amountApproved`,
-- `orderNumber`, `orderDate`) are NEVER touched by the reklamacja. That is why
-- `claim_accepted_payment_complete` is left EXACTLY as is — an UZNANA reklamacja
-- on a ZAAKCEPTOWANO wniosek keeps that constraint satisfied by construction, and
-- the reklamacja's own payout reference is carried by `reklamacjaOrderNumber`.
--
-- This migration:
--   1. Creates enum "ReklamacjaResolution" (UZNANA / ODRZUCONA) and adds 5
--      nullable columns to "claims":
--        reklamacjaOrderNumber  — «nr zlecenia» of an UZNANA reklamacja. Separate
--                                 from claims.orderNumber: the UI prefills from
--                                 it, but they may differ (MAGTRANS usually
--                                 amends the old zlecenie, sometimes issues a new
--                                 one).
--        reklamacjaResolution   — the outcome. NULL = no reklamacja OR still
--                                 pending (pending ⇔ status = 'REKLAMACJA').
--        reklamacjaSubmittedAt  — when the carrier filed. NOT derivable from
--                                 statusChangedAt, which the decision re-stamps
--                                 during the roll-back to statusBeforeReklamacja.
--        reklamacjaDecidedAt    — when pracownik/admin decided.
--        reklamacjaDecidedById  — who decided. Mirrors
--                                 `claims_verifiedById_fkey` exactly: optional
--                                 UUID FK → users(id), ON DELETE SET NULL
--                                 ON UPDATE CASCADE, no dedicated index.
--   2. Best-effort backfills rows filed under the OLD reklamacja semantics
--      (production went live 2026-07-29, so such rows may exist).
--   3. Adds CHECK "claim_reklamacja_resolution_complete" — an UZNANA reklamacja
--      must carry a non-empty `reklamacjaOrderNumber`. Added AFTER the backfill so
--      the backfilled UZNANA rows can satisfy it.
--
-- Forward-only (no down migration), fully additive: nothing is dropped or
-- renamed, all new columns are nullable.

-- ── 1. New enum + additive columns ──────────────────────────────────────────
CREATE TYPE "ReklamacjaResolution" AS ENUM ('UZNANA', 'ODRZUCONA');

-- AlterTable
ALTER TABLE "claims" ADD COLUMN     "reklamacjaDecidedAt" TIMESTAMP(3),
ADD COLUMN     "reklamacjaDecidedById" UUID,
ADD COLUMN     "reklamacjaOrderNumber" TEXT,
ADD COLUMN     "reklamacjaResolution" "ReklamacjaResolution",
ADD COLUMN     "reklamacjaSubmittedAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_reklamacjaDecidedById_fkey" FOREIGN KEY ("reklamacjaDecidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 2. Best-effort backfill of pre-rework reklamacja rows ───────────────────
-- NOTE on enum literals: only 'NA WERYFIKACJI' and 'OCZEKUJE NA AUTORYZACJĘ'
-- carry @map values in "ClaimStatus"; 'ZAAKCEPTOWANO', 'ODRZUCONO' and
-- 'REKLAMACJA' are literal (Prisma name == DB value), so they can be compared
-- directly below.

-- 2a. PENDING reklamacje (still sitting in status 'REKLAMACJA'). Under the old
--     flow the submit stamped `statusChangedAt` on the transition into
--     'REKLAMACJA' and nothing has re-stamped it since, so it IS the submit
--     moment — recover it into the new column. Resolution stays NULL (correct:
--     pending). `reklamacjaDecidedAt`/`ById` stay NULL (not decided yet).
UPDATE "claims"
SET "reklamacjaSubmittedAt" = "statusChangedAt"
WHERE "reklamacjaSubmitted" = true
  AND "status" = 'REKLAMACJA'
  AND "statusChangedAt" IS NOT NULL
  AND "reklamacjaSubmittedAt" IS NULL;

-- 2b. DECIDED reklamacje. Under the OLD semantics the decision mapped the
--     outcome onto the status itself: accept → 'ZAAKCEPTOWANO',
--     reject → 'ODRZUCONO'. Reconstruct the outcome from where the row landed.
--     For the UZNANA case also seed `reklamacjaOrderNumber` from the wniosek's
--     `orderNumber` — best-effort (that IS the zlecenie the old flow paid under)
--     and it satisfies the CHECK added in step 3. `COALESCE(..., 'BRAK')` guards
--     the pathological case of a ZAAKCEPTOWANO row with an empty orderNumber —
--     impossible today thanks to `claim_accepted_payment_complete`, but it keeps
--     this UPDATE independent of that constraint's history.
--     `reklamacjaSubmittedAt` / `reklamacjaDecidedAt` / `reklamacjaDecidedById`
--     are deliberately left NULL: those moments were never recorded and cannot
--     be reconstructed (statusChangedAt now holds the DECISION time, but under
--     the old flow it is indistinguishable from an ordinary status change, so we
--     do not guess). Readers must treat NULL as "unknown", not "never happened".
UPDATE "claims"
SET "reklamacjaResolution" = CASE "status"
      WHEN 'ZAAKCEPTOWANO' THEN 'UZNANA'::"ReklamacjaResolution"
      ELSE 'ODRZUCONA'::"ReklamacjaResolution"
    END,
    "reklamacjaOrderNumber" = CASE "status"
      WHEN 'ZAAKCEPTOWANO' THEN COALESCE(NULLIF("orderNumber", ''), 'BRAK')
      ELSE "reklamacjaOrderNumber"
    END
WHERE "reklamacjaSubmitted" = true
  AND "status" IN ('ZAAKCEPTOWANO', 'ODRZUCONO')
  AND "reklamacjaResolution" IS NULL;

-- ── 3. Status-conditional CHECK on the reklamacja outcome ───────────────────
-- Sibling of `claim_accepted_payment_complete` (see
-- 20260507191424_phase3_blocks), same shape: the column stays NULLable because
-- the reklamacja row is created by the carrier long before MAGTRANS assigns a
-- zlecenie number — but resolving it as UZNANA is gated. Written with
-- IS DISTINCT FROM so that resolution = NULL (no reklamacja / pending) passes
-- (`!=` would evaluate to NULL and, while CHECK treats NULL as satisfied, the
-- explicit form documents the intent).
-- The mirror rule for the other outcome (ODRZUCONA ⇒ non-empty
-- `reklamacjaResponse`) is enforced at the api layer, NOT here — see
-- "Invariants for api-agent".
ALTER TABLE "claims"
  ADD CONSTRAINT "claim_reklamacja_resolution_complete"
  CHECK (
    "reklamacjaResolution" IS DISTINCT FROM 'UZNANA'
    OR (
      "reklamacjaOrderNumber" IS NOT NULL
      AND "reklamacjaOrderNumber" != ''
    )
  );
