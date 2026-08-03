// Document-expiry alert severity — the single source of truth shared by the
// API (which classifies rows) and the web (which renders badges/tiles).
//
// Feature: surface documents (carrier OCP insurance + transport licence,
// vehicle fuel card, driver licence) whose expiry date is approaching or has
// passed, purely IN-APP (no email). Because it is stateless and in-app, the
// classification is computed LIVE on every request against "today" in the
// MAGTRANS timezone — that already IS a per-request (hence daily) check, with
// none of the drift / duplicate-notification / multi-replica problems a cron
// would carry.
//
// Three escalation points requested by the product owner — a week out, three
// days out, and the last day — map onto the buckets below, with an extra
// `expired` bucket because an already-invalid document is the most urgent of
// all and must never be hidden.

import { calendarDaysBetween } from './business-date';

/**
 * Severity buckets, most-urgent first. Derived purely from `daysToExpiry`
 * (whole calendar days, Europe/Warsaw):
 *   - `expired`  — d < 0  (already invalid; red)
 *   - `critical` — d = 0  (expires today = "the last day"; red)
 *   - `warning`  — 1..3   (amber)
 *   - `upcoming` — 4..7   (blue)
 * A document more than 7 days out is NOT surfaced (returns `null`).
 */
export type DocumentAlertSeverity =
  | 'expired'
  | 'critical'
  | 'warning'
  | 'upcoming';

/**
 * Outer window (in days) and the two inner cutoffs. `upcoming` is the widest
 * surfaced band; a document further out than `upcoming` days is not an alert.
 * Change here → both API filtering and web copy stay in sync.
 */
export const DOCUMENT_ALERT_THRESHOLDS = {
  /** Outer window — nothing beyond this many days ahead is surfaced. */
  upcoming: 7,
  /** ≤ this many days → `warning`. */
  warning: 3,
  /** ≤ this many days → `critical` (0 = expires today). */
  critical: 0,
} as const;

/** Severity ordering for stable "most urgent first" sorts. */
export const DOCUMENT_ALERT_SEVERITY_ORDER: Record<
  DocumentAlertSeverity,
  number
> = {
  expired: 0,
  critical: 1,
  warning: 2,
  upcoming: 3,
};

/**
 * Whole calendar days from today (Europe/Warsaw) to `expiry`. Future → > 0,
 * today → 0, past → < 0. `expiry` is a date-only value (stored `@db.Date`,
 * i.e. UTC midnight) or any instant — both are reduced to their Warsaw-day
 * anchor by {@link calendarDaysBetween}, so the result is an exact integer.
 */
export function daysToExpiry(expiry: Date, now: Date = new Date()): number {
  return calendarDaysBetween(now, expiry);
}

/**
 * Classifies `daysToExpiry` into a severity bucket, or `null` when the
 * document is further out than the outer window (not an alert). This is the
 * ONLY place the thresholds are applied — the API uses it to build the alert
 * list and the web uses it for standalone badge tone if needed.
 */
export function classifyDocumentAlert(
  days: number,
): DocumentAlertSeverity | null {
  if (days < DOCUMENT_ALERT_THRESHOLDS.critical) return 'expired';
  if (days === DOCUMENT_ALERT_THRESHOLDS.critical) return 'critical';
  if (days <= DOCUMENT_ALERT_THRESHOLDS.warning) return 'warning';
  if (days <= DOCUMENT_ALERT_THRESHOLDS.upcoming) return 'upcoming';
  return null;
}

/** Convenience: severity directly from an expiry date (or `null`). */
export function severityForExpiry(
  expiry: Date,
  now: Date = new Date(),
): DocumentAlertSeverity | null {
  return classifyDocumentAlert(daysToExpiry(expiry, now));
}
