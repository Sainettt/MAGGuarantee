// Civil (calendar) date arithmetic on DAY NUMBERS — internal to `domain/`.
//
// A day number is the count of days since 1970-01-01 in the proleptic
// Gregorian calendar (1970-01-01 → 0, 1969-12-31 → -1). Everything here is
// pure integer arithmetic (Howard Hinnant's `days_from_civil` /
// `civil_from_days`): no `Date`, no time zone, no DST. A calendar date means
// the same day in every process zone, which is the whole point — the km-calc
// engine, the board settlement and the ISO-week helpers all walk the calendar
// through this module, so none of them can drift with `TZ`.
//
// Deliberately NOT re-exported from `domain/index.ts`: the public surface is
// `iso-week.ts` (string-in / string-out). Day numbers are an implementation
// detail of the shared package.

/** Calendar date components; `m` and `d` are 1-based. */
export interface CivilDate {
  y: number;
  /** 1..12 */
  m: number;
  /** 1..31 */
  d: number;
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/u;

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  if (m === 2) return isLeapYear(y) ? 29 : 28;
  return m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31;
}

/** Day number of a calendar date. Inputs are trusted (validate first). */
export function dayNumberFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400; // [0, 399]
  const mp = (m + 9) % 12; // March = 0 … February = 11
  const doy = Math.floor((153 * mp + 2) / 5) + d - 1; // [0, 365]
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146_097 + doe - 719_468;
}

/** Calendar date of a day number (inverse of {@link dayNumberFromCivil}). */
export function civilFromDayNumber(dayNumber: number): CivilDate {
  const z = dayNumber + 719_468;
  const era = Math.floor(z / 146_097);
  const doe = z - era * 146_097; // [0, 146096]
  const yoe = Math.floor(
    (doe -
      Math.floor(doe / 1_460) +
      Math.floor(doe / 36_524) -
      Math.floor(doe / 146_096)) /
      365,
  ); // [0, 399]
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153); // [0, 11]
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  return { y, m, d };
}

/**
 * Day number of a strict `YYYY-MM-DD` string, or `null` when the string is
 * not a real calendar date (`2026-02-30`, `2026-13-01`, `26-1-1`, …).
 */
export function dayNumberFromIso(iso: string | null | undefined): number | null {
  if (typeof iso !== 'string') return null;
  const match = ISO_DATE_RE.exec(iso);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return dayNumberFromCivil(y, m, d);
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** `YYYY-MM-DD` (4-digit year) of a day number — sorts as a date. */
export function isoFromDayNumber(dayNumber: number): string {
  const { y, m, d } = civilFromDayNumber(dayNumber);
  return `${String(y).padStart(4, '0')}-${pad2(m)}-${pad2(d)}`;
}

/** ISO weekday of a day number: Monday = 1 … Sunday = 7 (1970-01-01 was a Thursday). */
export function isoWeekdayOfDayNumber(dayNumber: number): number {
  return (((dayNumber + 3) % 7) + 7) % 7 + 1;
}

/** `{ isoYear, isoWeek }` of a day number — the week belongs to the year of its Thursday. */
export function isoWeekOfDayNumber(dayNumber: number): {
  isoYear: number;
  isoWeek: number;
} {
  const thursday = dayNumber - isoWeekdayOfDayNumber(dayNumber) + 4;
  const isoYear = civilFromDayNumber(thursday).y;
  const isoWeek =
    Math.floor((thursday - dayNumberFromCivil(isoYear, 1, 1)) / 7) + 1;
  return { isoYear, isoWeek };
}

/**
 * Day number of the Monday of ISO week `isoWeek` of `isoYear`. Week 1 is the
 * week containing 4 January. Pure arithmetic — the week is NOT range-checked
 * (validate with `isValidIsoWeek` first).
 */
export function mondayDayNumberOfIsoWeek(isoYear: number, isoWeek: number): number {
  const jan4 = dayNumberFromCivil(isoYear, 1, 4);
  const mondayOfWeek1 = jan4 - isoWeekdayOfDayNumber(jan4) + 1;
  return mondayOfWeek1 + (isoWeek - 1) * 7;
}

/** `YYYY-Www` key — 4-digit year, always two-digit week. Not range-checked. */
export function formatIsoWeekKeyRaw(isoYear: number, isoWeek: number): string {
  return `${String(isoYear).padStart(4, '0')}-W${pad2(isoWeek)}`;
}
