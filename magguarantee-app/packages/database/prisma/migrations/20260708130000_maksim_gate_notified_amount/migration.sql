-- Maksim authorization gate — re-notify bug fix.
-- Adds `maksimGateNotifiedAmount`: the over-threshold dopłata (EUR) Maksim was
-- LAST notified about via the auto-confirmation email. The api `_applyMaksimGate`
-- reads it to detect when a re-verify moved the amount and Maksim must be
-- re-notified. NULL when the gate was never armed/notified or was reset; nulled
-- in lockstep with the rest of the maksimGate* fields.
--
-- Same precision as `paymentEur` / `amountRequested` / `origPaymentEur`
-- (DECIMAL(12,2); money is Decimal, never Float).
--
-- Physical table is `claims` (Claim model @@map). Nullable, no default →
-- backfills existing rows to NULL. Forward-only (greenfield DB per CLAUDE.md).

-- AlterTable
ALTER TABLE "claims" ADD COLUMN     "maksimGateNotifiedAmount" DECIMAL(12,2);
