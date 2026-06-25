// Month helpers for the per-vehicle monthly km-calendar modal
// (docs/14-design-system.md §7.7.6). Sibling to `week.ts`: the same
// timezone-stable, string-only philosophy. A calendar day is a `YYYY-MM-DD`
// string and a month is a `YYYY-MM` string — never an instant — so the math is
// done by slicing / arithmetic on those parts, not by walking local `Date`s.
//
// `weekdayIndexMonFirst` (Monday-first leading-blank count) and `todayIso`
// (Europe/Warsaw business date) are NOT re-implemented here — they already live
// in `week.ts` and are re-exported so callers have one import surface.
//
// Every function is PURE: nothing reads `Date.now()`. The month-paging bound
// predicates (`canPrev` / `canNext`) take the `createdAt` / `today` month keys
// as STRING arguments so they can be unit-tested without faking the clock —
// `YYYY-MM` lexical order is chronological order, so they are plain `>`/`<`.

export { todayIso, weekdayIndexMonFirst } from './week';

/** Parses the `YYYY-MM` parts of a `YYYY-MM-DD` (or `YYYY-MM`) ISO string. */
function yearMonth(iso: string): { year: number; month: number } {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  return { year, month };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** `2026-06` — the `YYYY-MM` month key of a `YYYY-MM-DD` (or `YYYY-MM`). */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/** First day of the month containing `iso` → `YYYY-MM-01`. */
export function startOfMonthIso(iso: string): string {
  return `${monthKey(iso)}-01`;
}

/** Number of days in the month containing `iso` (28/29/30/31). */
export function daysInMonth(iso: string): number {
  const { year, month } = yearMonth(iso);
  // Day 0 of the *next* month is the last day of THIS month — `Date.UTC`
  // normalises December→January, so no special-casing of the year boundary.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Last day of the month containing `iso` → `YYYY-MM-DD` (the 28th/29th/30th/31st). */
export function endOfMonthIso(iso: string): string {
  return `${monthKey(iso)}-${pad2(daysInMonth(iso))}`;
}

/**
 * Adds `n` months (may be negative) to the month containing `iso`, returning
 * the FIRST day of the resulting month (`YYYY-MM-01`). Day-of-month is dropped
 * deliberately — month paging only ever cares about which month it lands in,
 * and anchoring to the 1st sidesteps the "Jan 31 + 1 month" overflow trap.
 */
export function addMonths(iso: string, n: number): string {
  const { year, month } = yearMonth(iso);
  // month is 1-based; convert to a 0-based absolute month index, shift, split.
  const total = year * 12 + (month - 1) + n;
  const newYear = Math.floor(total / 12);
  const newMonth = (total % 12 + 12) % 12; // 0-based, always 0..11
  return `${newYear}-${pad2(newMonth + 1)}-01`;
}

/** All `YYYY-MM-DD` days of the month containing `iso`, day 1 → last, in order. */
export function monthDays(iso: string): string[] {
  const prefix = monthKey(iso);
  const n = daysInMonth(iso);
  return Array.from({ length: n }, (_, i) => `${prefix}-${pad2(i + 1)}`);
}

/**
 * Can we page to the PREVIOUS month? `false` once the shown month has reached
 * the vehicle's creation month (its lower bound). Both args are `YYYY-MM` keys;
 * lexical `>` is chronological `>`.
 */
export function canPrev(
  currentMonthKey: string,
  createdAtMonthKey: string,
): boolean {
  return currentMonthKey > createdAtMonthKey;
}

/**
 * Can we page to the NEXT month? `false` once the shown month has reached the
 * current (business-`today`) month — the upper bound. Both args are `YYYY-MM`
 * keys; lexical `<` is chronological `<`.
 */
export function canNext(
  currentMonthKey: string,
  todayMonthKey: string,
): boolean {
  return currentMonthKey < todayMonthKey;
}
