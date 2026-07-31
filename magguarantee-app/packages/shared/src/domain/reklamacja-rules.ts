// Reklamacja (complaint) eligibility — SINGLE SOURCE OF TRUTH.
//
// REWORK 2026-07-31. The carrier files exactly ONE reklamacja per wniosek, on a
// DECIDED wniosek (`ZAAKCEPTOWANO` / `ODRZUCONO`), within 48 h of the decision,
// asking for at most the UNPAID REMAINDER of what it originally requested.
//
// Before this module the ceiling formula was hand-inlined TWICE — in
// `ClaimsService.submitReklamacja` (api) and in `ReklamacjaSheet.tsx` (web) —
// and the two had already drifted (the api carried a `+1 €` tolerance the web
// did not, and the web rendered `null` where the api still accepted a value).
// Both layers now call `getReklamacjaEligibility`; nobody re-derives the cap.
//
// Style follows `claim-submission-rules.ts`: pure functions, no Date.now(), no
// I/O, no Nest / Next / Prisma imports (docs/11-folder-structure.md — shared has
// no runtime ties). "Now" is always INJECTED so unit tests are deterministic.
//
// Business rules (docs/04-data-model.md §Claim reklamacja fields,
// docs/01-overview.md §5):
//   1. one-shot          — `reklamacjaSubmitted` is never reset;
//   2. decided-only      — `NA_WERYFIKACJI` / `OCZEKUJE_NA_AUTORYZACJE` /
//                          `REKLAMACJA` are all ineligible;
//   3. 48 h window       — measured from `statusChangedAt` (the decision stamp);
//   4. unpaid remainder  — `maxAmount = originallyRequested − alreadyPaid`.

import type { ClaimStatus } from '../schemas/claims';

/**
 * Window (hours) during which a decided wniosek may be disputed, measured from
 * `Claim.statusChangedAt`. Boundary INCLUSIVE — at exactly 48:00:00 the carrier
 * can still file; 48 h + 1 min cannot.
 */
export const REKLAMACJA_WINDOW_HOURS = 48;

const MS_PER_HOUR = 60 * 60 * 1000;

/** Why filing is refused. `null` ⇒ the carrier may file. */
export type ReklamacjaBlockedReason =
  /** The wniosek has not been decided yet (or is already in `REKLAMACJA`). */
  | 'NOT_DECIDED'
  /** One reklamacja per wniosek, ever — this one already has one. */
  | 'ALREADY_SUBMITTED'
  /** More than `REKLAMACJA_WINDOW_HOURS` since the decision. */
  | 'WINDOW_EXPIRED'
  /** Our payout already equals (or exceeds) the amount originally requested. */
  | 'NO_DELTA';

/**
 * The claim columns the rules read. Deliberately a flat structural shape (not
 * `ClaimDto`) so the api can feed a repository row and the web a DTO without
 * either side adapting.
 *
 * - `origPaymentEur` — immutable submit-time km-calc dopłata, i.e. what the
 *   carrier ORIGINALLY asked for. `null` on legacy rows → falls back to
 *   `paymentEur` (see `resolveReklamacjaCap`).
 * - `paymentEur` — the CURRENT km-calc output (rewritten by every verifier
 *   correction), used only as the legacy fallback.
 * - `amountApproved` — what MAGTRANS actually pays; counts as paid ONLY when the
 *   wniosek was accepted.
 * - `statusChangedAt` — the decision stamp; `null` ⇒ no deadline can be derived
 *   (never expires — preserves the pre-rework api behaviour for legacy rows).
 */
export interface ReklamacjaEligibilityInput {
  status: ClaimStatus;
  origPaymentEur: number | null;
  paymentEur: number;
  amountApproved: number | null;
  reklamacjaSubmitted: boolean;
  statusChangedAt: Date | string | null;
}

/** Verdict + the two numbers the UI/api need for messaging. */
export interface ReklamacjaEligibility {
  /** `true` iff every rule passes (⇔ `blockedReason === null`). */
  canFile: boolean;
  /**
   * Ceiling for `kwotaReklamacji`, rounded to 2 dp. MAY be `<= 0` (that is the
   * `NO_DELTA` case) — callers use the value for the "maksymalnie X €" hint and
   * for the strict cap comparison, so it is always returned.
   */
  maxAmount: number;
  /**
   * Instant the 48 h window closes, or `null` when `statusChangedAt` is absent
   * (then the window rule is skipped entirely).
   */
  deadlineAt: Date | null;
  blockedReason: ReklamacjaBlockedReason | null;
}

/** Statuses a reklamacja may be filed against. */
const DECIDED_STATUSES: readonly ClaimStatus[] = ['ZAAKCEPTOWANO', 'ODRZUCONO'];

/** Money → integer cents. All comparisons happen at this precision. */
function cents(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100);
}

/** Integer cents → 2-dp money. */
function fromCents(value: number): number {
  return value / 100;
}

/** Accepts a `Date`, an ISO string, or `null`. Malformed input ⇒ `null`. */
function toDate(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * The reklamacja ceiling — «what I asked for minus what you actually paid».
 *
 *   `maxAmount = (origPaymentEur ?? paymentEur) − (accepted ? amountApproved : 0)`
 *
 * Why the `origPaymentEur ?? paymentEur` fallback: `origPaymentEur` was added
 * later and is `null` on rows created before it existed. For an ACCEPTED legacy
 * row `amountApproved ≈ paymentEur`, so the fallback naturally yields `0` → the
 * `NO_DELTA` block (fail-closed, we never invent a ceiling). For a REJECTED
 * legacy row nothing was paid, so the current km-calc figure is a meaningful
 * cap.
 *
 * Rejected wnioski have `alreadyPaid = 0` by definition — `amountApproved` is
 * only written on an acceptance, and a stale value on a rejected row must not
 * shrink the carrier's ceiling.
 *
 * Returned rounded to 2 dp; can be `<= 0`.
 */
export function resolveReklamacjaCap(input: {
  status: ClaimStatus;
  origPaymentEur: number | null;
  paymentEur: number;
  amountApproved: number | null;
}): number {
  const requested = input.origPaymentEur ?? input.paymentEur;
  const paid =
    input.status === 'ZAAKCEPTOWANO' ? (input.amountApproved ?? 0) : 0;
  return fromCents(cents(requested) - cents(paid));
}

/**
 * Whether a requested `amount` fits under the ceiling — STRICT, at cent
 * precision (the legacy `+1 €` tolerance is gone). Equality passes: exactly the
 * cap is allowed, cap + 0.01 is not.
 *
 * Positivity (`> 0`) is NOT checked here — that is `SubmitReklamacjaSchema`'s
 * job (a 400 at the validation pipe, not a business 422).
 */
export function isWithinReklamacjaCap(
  amount: number,
  maxAmount: number,
): boolean {
  return cents(amount) <= cents(maxAmount);
}

/**
 * The reklamacja deadline for a decided wniosek — `statusChangedAt + 48 h`.
 * `null` when there is no decision stamp (then the window rule is skipped).
 */
export function reklamacjaDeadline(
  statusChangedAt: Date | string | null,
): Date | null {
  const decidedAt = toDate(statusChangedAt);
  if (!decidedAt) return null;
  return new Date(decidedAt.getTime() + REKLAMACJA_WINDOW_HOURS * MS_PER_HOUR);
}

/**
 * Evaluate every reklamacja rule in one pass.
 *
 * Blocked-reason PRECEDENCE (first match wins) — chosen so the carrier always
 * sees the most fundamental obstacle first:
 *
 *   1. `NOT_DECIDED`       — nothing to dispute yet;
 *   2. `ALREADY_SUBMITTED` — one-shot flag already burnt;
 *   3. `WINDOW_EXPIRED`    — past 48 h from the decision;
 *   4. `NO_DELTA`          — nothing left unpaid to ask for.
 *
 * `maxAmount` and `deadlineAt` are ALWAYS computed (even when blocked) because
 * the UI renders them in the dead-end copy (docs/14 §"Reklamacja sheet").
 *
 * Pure — `now` is injected by the caller.
 */
export function getReklamacjaEligibility(
  input: ReklamacjaEligibilityInput,
  now: Date,
): ReklamacjaEligibility {
  const maxAmount = resolveReklamacjaCap(input);
  const deadlineAt = reklamacjaDeadline(input.statusChangedAt);

  const blockedReason = ((): ReklamacjaBlockedReason | null => {
    if (!DECIDED_STATUSES.includes(input.status)) return 'NOT_DECIDED';
    if (input.reklamacjaSubmitted) return 'ALREADY_SUBMITTED';
    // No stamp ⇒ no deadline ⇒ the window rule cannot fire (legacy rows).
    if (deadlineAt !== null && now.getTime() > deadlineAt.getTime()) {
      return 'WINDOW_EXPIRED';
    }
    if (cents(maxAmount) <= 0) return 'NO_DELTA';
    return null;
  })();

  return {
    canFile: blockedReason === null,
    maxAmount,
    deadlineAt,
    blockedReason,
  };
}
