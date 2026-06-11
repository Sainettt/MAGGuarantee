// Polish working-day calendar — public-holiday set + working-day arithmetic.
//
// Net-new for the pracownik verification-SLA "attention" feature
// (docs/21-pracownik-verification-sla.md §3). Pure TypeScript: no Node, Nest,
// Prisma or date-fns imports — both the API (NestJS) and the web (Next.js)
// bundle the same code so the deadline / bucket math never drifts.
//
// ⚠️ This is NOT `getEUBanDays` from `eu-calendar.ts`. That set is the EU
// heavy-vehicle driving-ban calendar (incl. German/Dutch holidays such as
// Wielki Piątek / Good Friday and Boże Ciało in DE/AT/IT) — the WRONG set for
// a Polish working-day count. We only reuse `calcEaster` (a pure helper).
//
// Convention: dates are *calendar* dates with no time-of-day semantics. We use
// `new Date(year, month, day)` (local-midnight) and only ever read
// `getFullYear/getMonth/getDate/getDay`, so DST and UTC offset don't affect the
// keys. The SLA spec is explicitly "date-based, Europe/Warsaw"; callers are
// expected to hand us local Warsaw calendar dates (see `bucketForAnchor`).

import { calcEaster } from './eu-calendar';

// ─── Public types ────────────────────────────────────────

/** Bucket of a deadline relative to "now", per docs/21 §2. */
export type SlaBucket = 'overdue' | 'dueSoon' | 'onTrack';

/**
 * Result of the deadline/bucket helper. `deadline` is the local-midnight Date
 * of the day by which the anchor's claim must be verified; `workingDaysLeft`
 * is the *signed* working-day distance from `now` to `deadline` (negative once
 * the deadline has passed); `bucket` classifies it.
 */
export interface SlaDeadline {
  /** Local-midnight Date of the verification deadline. */
  deadline: Date;
  /** Signed working days from `now` to `deadline` (0 = due today, <0 = overdue). */
  workingDaysLeft: number;
  /** Mutually-exclusive bucket; `overdue` wins over `dueSoon`. */
  bucket: SlaBucket;
}

// ─── Constants ───────────────────────────────────────────

/**
 * SLA window: a claim entering `NA_WERYFIKACJI` must be verified within this
 * many Polish working days, counting forward from the day *after* it entered
 * the status (anchor day excluded). Per docs/21 §1.
 */
export const SLA_WORKING_DAYS = 7;

/**
 * `dueSoon` upper bound (inclusive). `0..3` working days left = amber.
 * Per docs/21 §2.
 */
export const SLA_DUE_SOON_DAYS = 3;

/**
 * Fixed-date Polish public holidays (dni ustawowo wolne od pracy). Polish set
 * ONLY — deliberately omits Wielki Piątek (Poland does NOT observe Good
 * Friday) and the country-specific EU bans. Label is the Polish name.
 *
 * Source: ustawa o dniach wolnych od pracy. Mirrors docs/21 §3.
 */
const FIXED_POLISH_HOLIDAYS: ReadonlyArray<
  readonly [month: number, day: number, label: string]
> = [
  [1, 1, 'Nowy Rok'],
  [1, 6, 'Trzech Króli'],
  [5, 1, 'Święto Pracy'],
  [5, 3, 'Święto Konstytucji 3 Maja'],
  [8, 15, 'Wniebowzięcie NMP'],
  [11, 1, 'Wszystkich Świętych'],
  [11, 11, 'Narodowe Święto Niepodległości'],
  [12, 25, 'Boże Narodzenie (1. dzień)'],
  [12, 26, 'Boże Narodzenie (2. dzień)'],
];

/**
 * Easter-relative Polish holidays (offset in days from Easter Sunday).
 * Poniedziałek Wielkanocny (+1) and Boże Ciało (+60) — the two movable Polish
 * public holidays. Wielkanoc Sunday itself is already a Sunday (non-working);
 * Zielone Świątki (Pentecost, +49) is also always a Sunday. Per docs/21 §3.
 */
const EASTER_RELATIVE_POLISH_HOLIDAYS: ReadonlyArray<
  readonly [offset: number, label: string]
> = [
  [1, 'Poniedziałek Wielkanocny'],
  [60, 'Boże Ciało'],
];

// ─── Internal date helpers (pure, calendar-only) ─────────

/** `YYYY-MM-DD` key from a local-midnight Date. Pure arithmetic, no TZ parse. */
function isoDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${m < 10 ? '0' : ''}${m}-${day < 10 ? '0' : ''}${day}`;
}

/** Normalize any Date to local midnight, copying so the input is never mutated. */
function atMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Add `n` calendar days (immutable). */
function addDays(d: Date, n: number): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  out.setDate(out.getDate() + n);
  return out;
}

/** True for Saturday (6) and Sunday (0). */
function isWeekend(d: Date): boolean {
  const dow = d.getDay();
  return dow === 0 || dow === 6;
}

// ─── Public API ──────────────────────────────────────────

/**
 * All Polish public holidays for `year` as a Map<`YYYY-MM-DD`, label>.
 *
 * Fixed dates + the two Easter-relative movable holidays (Poniedziałek
 * Wielkanocny, Boże Ciało). Weekends are NOT filtered out here — a holiday that
 * lands on a Sunday is still returned; the working-day arithmetic already skips
 * weekends, so double-counting is harmless and the full set is more useful to
 * callers that want to render "why".
 */
export function polishHolidays(year: number): Map<string, string> {
  const out = new Map<string, string>();
  for (const [month, day, label] of FIXED_POLISH_HOLIDAYS) {
    out.set(isoDateKey(new Date(year, month - 1, day)), label);
  }
  const easter = calcEaster(year);
  for (const [offset, label] of EASTER_RELATIVE_POLISH_HOLIDAYS) {
    out.set(isoDateKey(addDays(easter, offset)), label);
  }
  return out;
}

/**
 * True when `date` is a Polish working day: not Saturday/Sunday and not a
 * Polish public holiday. Date-based; time-of-day is ignored.
 */
export function isPolishWorkingDay(date: Date): boolean {
  if (isWeekend(date)) return false;
  const d = atMidnight(date);
  const holidays = polishHolidays(d.getFullYear());
  return !holidays.has(isoDateKey(d));
}

/**
 * Add `n` Polish working days to `date`, returning the resulting local-midnight
 * Date. The anchor day itself is EXCLUDED — counting starts from the next day —
 * matching the SLA rule "from the day of entry, the entry day excluded"
 * (docs/21 §1).
 *
 * `n` must be a non-negative integer. `n === 0` returns `atMidnight(date)`
 * unchanged (no forward scan). Holidays are resolved per-year as the scan
 * crosses a year boundary, so New-Year / Trzech Króli rolls are handled.
 */
export function addPolishWorkingDays(date: Date, n: number): Date {
  let cursor = atMidnight(date);
  if (n <= 0) return cursor;
  let remaining = Math.floor(n);
  // Per-year holiday cache so a long scan doesn't recompute Easter each step.
  const holidayCache = new Map<number, Map<string, string>>();
  const holidaysFor = (y: number): Map<string, string> => {
    let h = holidayCache.get(y);
    if (!h) {
      h = polishHolidays(y);
      holidayCache.set(y, h);
    }
    return h;
  };
  while (remaining > 0) {
    cursor = addDays(cursor, 1);
    if (isWeekend(cursor)) continue;
    if (holidaysFor(cursor.getFullYear()).has(isoDateKey(cursor))) continue;
    remaining -= 1;
  }
  return cursor;
}

/**
 * Signed count of Polish working days from `a` to `b` (date-based). Counts the
 * working days strictly after `a` up to and INCLUDING `b` when `b > a`; returns
 * a negative count when `b < a` (working days strictly after `b` up to and
 * including `a`); `0` when `a` and `b` are the same calendar day.
 *
 * This "exclusive start, inclusive end" convention makes the SLA math line up:
 * `workingDaysBetween(today, deadline)` is the number of working days remaining
 * to act, hitting `0` exactly on the deadline day and going negative after it.
 */
export function workingDaysBetween(a: Date, b: Date): number {
  const start = atMidnight(a);
  const end = atMidnight(b);
  if (start.getTime() === end.getTime()) return 0;

  const forward = end.getTime() > start.getTime();
  const [lo, hi] = forward ? [start, end] : [end, start];

  let count = 0;
  let cursor = addDays(lo, 1); // exclusive of the lower bound
  const holidayCache = new Map<number, Map<string, string>>();
  const holidaysFor = (y: number): Map<string, string> => {
    let h = holidayCache.get(y);
    if (!h) {
      h = polishHolidays(y);
      holidayCache.set(y, h);
    }
    return h;
  };
  while (cursor.getTime() <= hi.getTime()) {
    if (
      !isWeekend(cursor) &&
      !holidaysFor(cursor.getFullYear()).has(isoDateKey(cursor))
    ) {
      count += 1;
    }
    cursor = addDays(cursor, 1);
  }
  return forward ? count : -count;
}

/**
 * Deadline + bucket helper for the verification SLA (docs/21 §1–2).
 *
 * Given the `anchorDate` (the day the claim entered `NA_WERYFIKACJI`) and
 * `now`, computes:
 *   - `deadline        = addPolishWorkingDays(anchorDate, slaDays)`
 *   - `workingDaysLeft = workingDaysBetween(now, deadline)`  (signed)
 *   - `bucket`:
 *       • `overdue`  when `workingDaysLeft < 0`               (deadline passed)
 *       • `dueSoon`  when `0 ≤ workingDaysLeft ≤ 3`           (closing in)
 *       • `onTrack`  when `workingDaysLeft > 3`               (comfortable)
 *
 * Buckets are mutually exclusive and `overdue` wins. `slaDays` /
 * `dueSoonThreshold` default to the documented 7 / 3 but are injectable for
 * tests.
 */
export function bucketForAnchor(
  anchorDate: Date,
  now: Date,
  slaDays: number = SLA_WORKING_DAYS,
  dueSoonThreshold: number = SLA_DUE_SOON_DAYS,
): SlaDeadline {
  const deadline = addPolishWorkingDays(anchorDate, slaDays);
  const workingDaysLeft = workingDaysBetween(now, deadline);
  const bucket: SlaBucket =
    workingDaysLeft < 0
      ? 'overdue'
      : workingDaysLeft <= dueSoonThreshold
        ? 'dueSoon'
        : 'onTrack';
  return { deadline, workingDaysLeft, bucket };
}
