// Money presentation rules for a wniosek — SHARED between the carrier views
// (`ClaimCard`, the claim detail page) and the pracownik views (`ClaimsTable`,
// `ClaimModal`) so the two sides never drift apart. The employee side used to
// paint every amount in brand red; a carrier reading "red" naturally hears
// "rejected", so both now follow the same status-driven semantics.
//
// THE THREE AMOUNTS. A claim carries three money figures that must never be
// confused with one another:
//
//   origPaymentEur — what the carrier originally asked for. Frozen at submit
//                    and never rewritten. `null` on rows created before the
//                    column existed (no backfill) — render an em-dash there,
//                    NEVER fall back to a current figure, because that would
//                    silently present a corrected amount as the request.
//   paymentEur     — the km-calc AFTER the verifier's corrections. Rewritten by
//                    every correction and by the delegation auto-recalc.
//   amountApproved — what MAGTRANS actually pays. Written only on the
//                    transition to ZAAKCEPTOWANO; `null` until then.
//
// (A fourth field, `amountRequested`, was dropped 2026-07-26 — it was a mirror
// of `paymentEur` that the UI mislabelled as the carrier's request.)

import type { ClaimStatus } from '@magguarantee/shared';

/**
 * Semantic tone for a claim's headline amount.
 *
 * Deliberately keyed off the STATUS, not off the sign or size of the number:
 * green means "this money was granted", red means "this claim was refused",
 * neutral means "nobody has decided yet". Colouring by amount instead (e.g.
 * `> 0 ? red : muted`) is what produced the original bug report — an accepted
 * wniosek rendered in the same alarm-red as a rejected one.
 */
export type MoneyTone = 'approved' | 'rejected' | 'pending';

export function moneyTone(status: ClaimStatus): MoneyTone {
  switch (status) {
    case 'ZAAKCEPTOWANO':
      return 'approved';
    case 'ODRZUCONO':
      return 'rejected';
    // NA_WERYFIKACJI / OCZEKUJE_NA_AUTORYZACJE are plainly undecided.
    // REKLAMACJA is a decided claim pulled back INTO dispute, so its previous
    // verdict no longer holds — neutral is the honest tone until it re-lands.
    default:
      return 'pending';
  }
}

/** Tailwind text colour per tone. Both halves of each pair are DS tokens. */
export const MONEY_TONE_TEXT: Record<MoneyTone, string> = {
  approved: 'text-success-dark dark:text-success',
  rejected: 'text-danger-dark dark:text-danger',
  pending: 'text-text',
};

/**
 * The headline amount for a claim plus which of the three figures it is, so the
 * caller can label it truthfully. `amountApproved` wins whenever a decision has
 * been recorded; otherwise the current km-calc is what is at stake.
 */
export function headlineAmount(claim: {
  paymentEur: number;
  amountApproved: number | null;
}): { value: number; kind: 'approved' | 'calc' } {
  return claim.amountApproved != null
    ? { value: claim.amountApproved, kind: 'approved' }
    : { value: claim.paymentEur, kind: 'calc' };
}

/**
 * Whether the verifier moved the money — i.e. whether it is worth showing the
 * carrier's original figure next to the current one. Suppressed when the two
 * agree (the overwhelmingly common case; showing two identical numbers is
 * noise) and when the snapshot is missing entirely (legacy rows).
 *
 * Compared at 2 dp because both columns are `Decimal(12,2)` — a raw `!==` on
 * floats that round-tripped through JSON can report a difference that no user
 * can see.
 */
export function verifierMovedAmount(claim: {
  paymentEur: number;
  origPaymentEur: number | null;
}): boolean {
  if (claim.origPaymentEur == null) return false;
  return (
    Math.round(claim.origPaymentEur * 100) !== Math.round(claim.paymentEur * 100)
  );
}
