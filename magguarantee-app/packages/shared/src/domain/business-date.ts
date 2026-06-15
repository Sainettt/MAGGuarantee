// Business-date helper — the single source of truth for "today" in the
// MAGTRANS operating timezone (Europe/Warsaw).
//
// Both the API (NestJS) and the web (Next.js) import THIS so the "today"
// boundary never drifts between server-authoritative guards and the client UI
// that greys-out non-editable cells. Pure TypeScript: the only platform API is
// `Intl.DateTimeFormat`, which is available in Node 20 and every modern
// browser — no Node-specific imports, no date-fns, no Prisma.
//
// Why a timezone-aware "today" and not plain UTC midnight: a UTC-midnight
// "today" lags the real Warsaw calendar day for the part of the night between
// local midnight and the UTC offset (CET/CEST = +01:00/+02:00). That lag made
// the day-edit guards reject "today" as if it were already past (or, depending
// on comparison direction, let a future cell through) for ~1–2h every night.
// `Intl.DateTimeFormat('en-CA', { timeZone })` resolves the actual Warsaw
// calendar date, so the boundary is correct at every instant of the day.

/** MAGTRANS operating timezone — all "today" boundaries are computed here. */
export const BUSINESS_TZ = 'Europe/Warsaw';

/**
 * Today's calendar date as `YYYY-MM-DD` in {@link BUSINESS_TZ}.
 *
 * Uses the `en-CA` locale, which formats dates as `YYYY-MM-DD` (ISO-8601
 * calendar-date order), so the parts join back into a directly-comparable
 * ISO date string. The optional `now` argument exists only for deterministic
 * tests — production callers pass nothing.
 */
export function businessTodayIso(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const y = parts.find((p) => p.type === 'year')!.value;
  const m = parts.find((p) => p.type === 'month')!.value;
  const d = parts.find((p) => p.type === 'day')!.value;
  return `${y}-${m}-${d}`;
}

/**
 * {@link businessTodayIso} encoded as UTC midnight of that calendar date.
 *
 * This is the canonical anchor for `Date`-vs-`Date` comparisons against
 * date-only values that are themselves stored as UTC midnight (the
 * `vehicle_daily_km.date` convention, and `isoDateToMidnightUtc` in the API).
 * Comparing two UTC-midnight dates gives clean calendar-day semantics: a cell
 * whose `date` equals business-today is `getTime() === ` this anchor (locked,
 * since "today" is not editable), a strictly-past cell is `<`, a future cell
 * is `>`.
 */
export function startOfBusinessTodayUtc(now: Date = new Date()): Date {
  return isoToMidnightUtc(businessTodayIso(now));
}

/**
 * `true` when `dateIso` (a `YYYY-MM-DD` calendar date) is strictly BEFORE
 * business-today in {@link BUSINESS_TZ} — i.e. an editable past day. Today and
 * any future date return `false`.
 *
 * String comparison is sufficient and timezone-safe here: both operands are
 * zero-padded `YYYY-MM-DD`, whose lexical order equals their chronological
 * order. Returns `false` for a malformed `dateIso` (callers validate the shape
 * upstream via Zod; this is a defensive default, never a silent "past").
 */
export function isPastBusinessDay(dateIso: string, now: Date = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return false;
  return dateIso < businessTodayIso(now);
}

/** Parse `YYYY-MM-DD` to UTC midnight. Internal — assumes a validated shape. */
function isoToMidnightUtc(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}
