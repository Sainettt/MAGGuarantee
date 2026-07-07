// Phase 12 — Guarantee Watchdog client-side derivations (docs/14 §12.0).
//
// Pure helpers over `GuaranteeComplianceItem` that encode the single §12.0
// state→severity map so the banner, the board sections, and the fleet-column
// join all agree. No rendering here — just classification + ordering.

import type { GuaranteeComplianceItem } from '@magguarantee/shared';

/** Watchdog-UI severity buckets (§12.0). `calm` = counting with ≥4 days room. */
export type WatchdogSeverity = 'violated' | 'dueSoon' | 'calm' | 'none';

/**
 * Map one live compliance row to its §12.0 severity.
 *   violated                          → 'violated' (red)
 *   counting & daysLeft ≤ 3           → 'dueSoon'  (amber)
 *   counting & daysLeft ≥ 4           → 'calm'     (muted)
 *   inactive / ok_active              → 'none'     (calm, not owed)
 */
export function watchdogSeverity(item: GuaranteeComplianceItem): WatchdogSeverity {
  if (item.state === 'violated') return 'violated';
  if (item.state === 'counting') {
    return item.daysLeft != null && item.daysLeft <= 3 ? 'dueSoon' : 'calm';
  }
  return 'none';
}

/** Is this vehicle *owed* a zgłoszenie (raises the carrier banner)? §12.2. */
export function isOwed(item: GuaranteeComplianceItem): boolean {
  const s = watchdogSeverity(item);
  return s === 'violated' || s === 'dueSoon';
}

/**
 * Severity-then-urgency comparator (§12.2 / §12.4): violated first (most
 * negative `daysLeft` on top), then dueSoon ascending by `daysLeft`. A `null`
 * `daysLeft` sorts last within its group (shouldn't happen for owed rows).
 */
export function compareByUrgency(
  a: GuaranteeComplianceItem,
  b: GuaranteeComplianceItem,
): number {
  const rank = (i: GuaranteeComplianceItem) =>
    i.state === 'violated' ? 0 : 1;
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  const da = a.daysLeft ?? Number.POSITIVE_INFINITY;
  const db = b.daysLeft ?? Number.POSITIVE_INFINITY;
  return da - db;
}
