// Maksim authorization gate — the single over-threshold predicate.
//
// Lives in `@magguarantee/shared` (next to `auth-threshold.ts`) so the API
// (NestJS) and the web (Next.js) derive the HARD gate from ONE source. The
// legacy app surfaced `getAuthThreshold` as a SOFT hint only ("Próg
// autoryzacji: 500 €", never enforced). This feature turns that same threshold
// into a HARD gate: when the dopłata STRICTLY exceeds the days-based band, the
// verifier's accept/reject decision is blocked until Maksim's out-of-band
// confirmation screenshot is uploaded.
//
// No new numbers — the 300/500/800/1000 € step function in `getAuthThreshold`
// is reused verbatim. This module only centralizes the comparison so FE
// (amber hint → hard block) and BE (gate arming) never drift.

import { getAuthThreshold } from './auth-threshold';

/** Inputs to the over-threshold check — the two claim fields the gate keys on. */
export interface MaksimConfirmationInput {
  /** Compensation due in EUR (`Claim.paymentEur`, the km-calc output). */
  paymentEur: number;
  /** Trip length in driven working days (`Claim.drivenDays`, `dni jezdne`). */
  drivenDays: number;
}

/**
 * True when the compensation STRICTLY exceeds the authorization threshold for
 * this trip length — i.e. Maksim's confirmation is required before a decision.
 *
 * The comparison is `paymentEur > getAuthThreshold(drivenDays)` — STRICTLY
 * greater. A dopłata sitting EXACTLY on the threshold does NOT trigger the gate
 * (300 € on the 300 € band is allowed without Maksim); only a value above it
 * does. This matches the SOFT amber hint the UI already computes, promoted to a
 * hard rule.
 *
 * Pure — no IO. `getAuthThreshold` collapses NaN / negative / non-finite
 * `drivenDays` to the 300 € band (legacy `parseFloat(...) || 0` semantics), so
 * this predicate never throws.
 */
export function requiresMaksimConfirmation(
  input: MaksimConfirmationInput,
): boolean {
  return input.paymentEur > getAuthThreshold(input.drivenDays);
}
