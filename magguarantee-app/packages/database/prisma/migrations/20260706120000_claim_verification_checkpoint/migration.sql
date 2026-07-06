-- Verifier-checkpoint feature ("Zapisz weryfikację") — the pracownik persists
-- his corrections BEFORE any accept/reject decision. Three additive columns on
-- Claim:
--   * verifiedAt      — when the verification was last saved/confirmed. NULL =
--                       not verified yet. The api resets it to NULL on the
--                       delegation auto-recalc.
--   * verifiedById    — who verified. Mirrors `decidedById`/`claims_decidedById_fkey`
--                       exactly: optional UUID FK → users(id), ON DELETE SET NULL
--                       ON UPDATE CASCADE, no dedicated index (same as the sibling).
--   * origPaymentEur  — immutable snapshot of the km-calc payment (Doplata) at
--                       submit time, NUMERIC(12,2) to match `paymentEur`. Powers
--                       the "Korekty weryfikatora" diff in the Maksim
--                       authorization email. Nullable: pre-existing rows have no
--                       snapshot.
--
-- Forward-only, no back-fill: the DB is greenfield (empty + seed-only, never in
-- production per CLAUDE.md). All three columns are nullable, so existing/seed
-- rows keep NULL — no data migration needed.

-- AlterTable
ALTER TABLE "claims" ADD COLUMN     "origPaymentEur" DECIMAL(12,2),
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedById" UUID;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
