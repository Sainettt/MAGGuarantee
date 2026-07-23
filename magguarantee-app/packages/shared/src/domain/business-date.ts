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
 * The Warsaw calendar date of an arbitrary instant `d`, as `YYYY-MM-DD` in
 * {@link BUSINESS_TZ}.
 *
 * Uses the `en-CA` locale, which formats dates as `YYYY-MM-DD` (ISO-8601
 * calendar-date order), so the parts join back into a directly-comparable
 * ISO date string. This is the general form: pass any `Date` (an event
 * timestamp, a `createdAt` instant, …) and get the Warsaw calendar day it
 * falls on — the time-of-day and UTC offset are folded away.
 */
export function businessDateIso(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')!.value;
  const m = parts.find((p) => p.type === 'month')!.value;
  const day = parts.find((p) => p.type === 'day')!.value;
  return `${y}-${m}-${day}`;
}

/**
 * Today's calendar date as `YYYY-MM-DD` in {@link BUSINESS_TZ}.
 *
 * Thin alias of {@link businessDateIso} for the common "now" case. The optional
 * `now` argument exists only for deterministic tests — production callers pass
 * nothing.
 */
export function businessTodayIso(now: Date = new Date()): string {
  return businessDateIso(now);
}

/**
 * The Warsaw calendar date of `d` encoded as UTC midnight of that date.
 *
 * Generalises {@link startOfBusinessTodayUtc} to any instant: reduce a full
 * timestamp (or a date-only UTC-midnight value, which maps to itself) to the
 * canonical UTC-midnight anchor of the Warsaw day it belongs to. Two values
 * reduced this way can be diffed for clean whole-calendar-day semantics
 * regardless of their original time-of-day / offset (see
 * {@link calendarDaysBetween}).
 */
export function startOfBusinessDayUtc(d: Date = new Date()): Date {
  return isoToMidnightUtc(businessDateIso(d));
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
  return startOfBusinessDayUtc(now);
}

/** One calendar day in milliseconds — both operands below are UTC midnight. */
const CALENDAR_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whole calendar days between two instants, measured in {@link BUSINESS_TZ}.
 *
 * Both `from` and `to` are first reduced to the UTC-midnight anchor of their
 * Warsaw calendar day ({@link startOfBusinessDayUtc}), so the result is an
 * EXACT signed integer number of days — never a fraction, and never off-by-one
 * from a DST transition (the anchors are UTC midnights, outside any offset
 * change). `to > from` ⇒ positive; same Warsaw day ⇒ `0`; `to` before `from`
 * ⇒ negative. Time-of-day on either operand is irrelevant.
 */
export function calendarDaysBetween(from: Date, to: Date): number {
  const a = startOfBusinessDayUtc(from).getTime();
  const b = startOfBusinessDayUtc(to).getTime();
  return Math.round((b - a) / CALENDAR_DAY_MS);
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
