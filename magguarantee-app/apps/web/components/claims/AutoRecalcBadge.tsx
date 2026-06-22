'use client';

// §7.10.4 — the STATIC auto-recalc badge in the pracownik ClaimModal's linked-
// delegation context row. Reports a server-side HISTORICAL event: when a late
// `zjechal` carried an `actualReturnAt` ≠ the claim's filed period, the backend
// either AUTO-APPLIED the recalc (claim not yet decided AND period not human-
// edited) or SKIPPED it (decided OR `periodAdjustedByVerifier`).
//
// This is distinct from §6.5.4's LIVE `<RecalcBadge>` (the debounced
// "Przeliczam…/Aktualne" by the dopłata value). Both may be visible. Two
// mutually-exclusive states, EXISTING tones only (no new variant):
//   • applied → success «Przeliczono wg faktycznej daty zjazdu»
//   • skipped → warning «Wymaga uwagi: …» (amber attention, NEVER danger)
//
// HEURISTIC NOTE (deviation, see report): §7.10.4 specs `claim.autoRecalcApplied`
// / `autoRecalcSkipped` DTO flags, but the shipped `ClaimDto` exposes only
// `periodAdjustedByVerifier` + the linked delegation's `actualReturnAt`. We
// derive the state from those: a divergence between the claim period end and the
// outing's actual return, gated by `periodAdjustedByVerifier`.

import { AlertTriangle, RefreshCw } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';

export type AutoRecalcState = 'applied' | 'skipped';

interface Props {
  state: AutoRecalcState;
  label: string;
  /** Optional tooltip (the §7.10.4 «Okres zaktualizowany…» / «Pominięto…» copy). */
  title?: string;
}

export function AutoRecalcBadge({ state, label, title }: Props) {
  const applied = state === 'applied';
  const Icon = applied ? RefreshCw : AlertTriangle;
  return (
    <Badge variant={applied ? 'success' : 'warning'} title={title}>
      <Icon size={12} className="mr-1" aria-hidden />
      {label}
    </Badge>
  );
}

/**
 * Resolve the §7.10.4 badge state from the available DTO fields, or `null` when
 * no badge should render (no linked outing, or it hasn't returned yet, or the
 * actual return matches the claim period — nothing to flag).
 *
 * @param claimDateEnd     ISO of the claim's current period end.
 * @param actualReturnAt   ISO of the linked outing's actual return (date-only on
 *                         the wire; we compare the date portion).
 * @param periodAdjusted   `Claim.periodAdjustedByVerifier`.
 */
export function resolveAutoRecalcState(
  claimDateEnd: string | null | undefined,
  actualReturnAt: string | null | undefined,
  periodAdjusted: boolean,
): AutoRecalcState | null {
  if (!actualReturnAt) return null;
  const endDay = (claimDateEnd ?? '').slice(0, 10);
  const returnDay = actualReturnAt.slice(0, 10);
  if (!endDay || !returnDay) return null;

  // The period end already equals the actual return → the recalc landed (or the
  // claim was filed on the right day). Treat as APPLIED only when there was a
  // divergence the system reconciled; if they already match and the verifier
  // didn't touch the period, the recalc applied cleanly.
  if (endDay === returnDay) {
    return periodAdjusted ? null : 'applied';
  }

  // The period end DIFFERS from the actual return:
  //   • verifier edited the period (or the claim was decided) → recalc SKIPPED.
  //   • otherwise the divergence is unreconciled → also needs attention.
  return 'skipped';
}
