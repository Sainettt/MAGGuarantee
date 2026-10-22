// Phase 7.6 / docs/21 — pure presentation model of one verification-SLA
// «attention» row (<SlaAttentionSection>). The dashboard `overdue` / `dueSoon`
// buckets carry both claims under verification (`NA_WERYFIKACJI`) and open
// reklamacje (`REKLAMACJA`, anchored on the reklamacja submission). A
// reklamacja row gets the regular claim status chip so it is not mistaken for
// a plain verification; a verification row stays as it was (no chip).
//
// Extracted from the component so the decision and the row's aria-label
// parameters are unit-testable: vitest here is node-only with no React
// plugin (see vitest.config.ts).

import type { DashboardSlaClaim } from '@magguarantee/shared';

/** Selects the `dashboard.sla.rowAria` wording and whether the chip shows. */
export type SlaRowKind = 'weryfikacja' | 'reklamacja';

/** Same label choice as <SlaCountdownBadge>, keyed into `dashboard.sla.countdown`. */
export type SlaCountdown =
  | { key: 'overdue'; days: number }
  | { key: 'lastDay' }
  | { key: 'dueSoon'; days: number };

export interface SlaRowView {
  kind: SlaRowKind;
  countdown: SlaCountdown;
}

export function slaCountdown(workingDaysLeft: number): SlaCountdown {
  if (workingDaysLeft < 0) {
    // Magnitude as a positive count so the ICU «dni» plural reads correctly.
    return { key: 'overdue', days: Math.abs(workingDaysLeft) };
  }
  if (workingDaysLeft === 0) return { key: 'lastDay' };
  return { key: 'dueSoon', days: workingDaysLeft };
}

export function slaRowView(
  claim: Pick<DashboardSlaClaim, 'status' | 'workingDaysLeft'>,
): SlaRowView {
  return {
    kind: claim.status === 'REKLAMACJA' ? 'reklamacja' : 'weryfikacja',
    countdown: slaCountdown(claim.workingDaysLeft),
  };
}
