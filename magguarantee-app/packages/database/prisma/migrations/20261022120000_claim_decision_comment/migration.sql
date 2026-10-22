-- Separate column for the verifier's decision text on a wniosek (UWAGI #4,
-- decision 2026-10-22).
--
-- Until now `claims.comment` had two writers. The carrier wrote it at submit,
-- and the wniosek decision then OVERWROTE it with the verifier's justification:
-- always on ODRZUCONO (the justification is required), and on ZAAKCEPTOWANO
-- whenever the verifier typed one. The carrier's note was lost, and readers
-- could not tell whose text they were showing. From now on:
--   * `comment`         - the carrier's note from submit. Staff never write it.
--   * `decisionComment` - the verifier's justification. Optional for
--                         ZAAKCEPTOWANO, required (non-blank) for ODRZUCONO.
--                         Enforced by the api only, deliberately NO CHECK.
--                         Same name as `vehicle_planner_transfers.decisionComment`.
-- Reklamacja answers are not part of this change. They already live in
-- `reklamacjaResponse`, and the reklamacja decision never wrote `comment`.
--
-- This migration:
--   1. Adds the nullable column `decisionComment TEXT`. The DDL is identical to
--      `prisma migrate diff` from the previous schema.
--   2. Backfills it: moves the text out of `comment` on rows where that text
--      can only have come from the verifier, i.e. wnioski decided ODRZUCONO:
--        * `status = 'ODRZUCONO'`, including rows that had a reklamacja which
--          was then decided. Both reklamacja outcomes roll the status back to
--          `statusBeforeReklamacja`, and that decision does not touch `comment`.
--        * `status = 'REKLAMACJA'` with `statusBeforeReklamacja = 'ODRZUCONO'`
--          (reklamacja still pending on a rejected wniosek).
--      On those rows `comment` becomes NULL: the carrier's original note was
--      overwritten by the decision and cannot be recovered.
--
-- ZAAKCEPTOWANO rows are deliberately SKIPPED (status ZAAKCEPTOWANO, and
-- REKLAMACJA with statusBeforeReklamacja = ZAAKCEPTOWANO). The justification was
-- optional there, so `comment` holds either the carrier's untouched note or the
-- verifier's acceptance comment, and nothing in the row tells the two apart.
-- Moving it would mislabel carrier notes as verifier text. Those rows keep
-- their text in `comment` (ambiguous, documented in schema.prisma and docs/12).
-- NA WERYFIKACJI / OCZEKUJE NA AUTORYZACJĘ rows were never decided, so their
-- `comment` is the carrier's and stays.
--
-- Enum literals: 'ODRZUCONO', 'REKLAMACJA' and 'ZAAKCEPTOWANO' have no @map in
-- "ClaimStatus" (Prisma name == DB value); only 'NA WERYFIKACJI' and
-- 'OCZEKUJE NA AUTORYZACJĘ' are mapped. Soft-deleted rows are included, so the
-- new semantics hold for every row. `updatedAt` is not bumped (raw SQL, and the
-- business content of the row does not change).
--
-- Forward-only and additive: nothing is dropped, renamed or retyped. Safe to
-- re-run: after the first pass the moved rows have `comment = NULL`, and the
-- `"decisionComment" IS NULL` guard never overwrites a value. The whole script
-- runs in Postgres' implicit transaction.

-- ── 1. Additive column ──────────────────────────────────────────────────────
-- AlterTable
ALTER TABLE "claims" ADD COLUMN     "decisionComment" TEXT;

-- ── 2. Backfill: verifier text of ODRZUCONO decisions moves out of comment ──
UPDATE "claims"
SET "decisionComment" = "comment",
    "comment" = NULL
WHERE "comment" IS NOT NULL
  AND "decisionComment" IS NULL
  AND (
    "status" = 'ODRZUCONO'
    OR ("status" = 'REKLAMACJA' AND "statusBeforeReklamacja" = 'ODRZUCONO')
  );
