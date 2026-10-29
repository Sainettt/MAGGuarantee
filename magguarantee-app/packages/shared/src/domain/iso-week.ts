// ISO 8601 week helpers — the single week calendar for km limits (2026-10-29).
//
// Business rule (docs/01-overview.md §«Расчёт гарантии»): weeks run Monday to
// Sunday, are numbered 1..52 or 1..53, and a week belongs to the year of its
// THURSDAY. So 2026-W01 = 29.12.2025–04.01.2026 and 2026-W53 =
// 28.12.2026–03.01.2027; 1 January 2021 (a Friday) is 2020-W53.
//
// The key of a week everywhere — `weekly_limits` addressing, the limits
// snapshot in `Claim.breakdown`, `PUT /limits/:isoWeek` — is `YYYY-Www` with a
// two-digit week (`2026-W05`, never `2026-W5`).
//
// One module for every consumer: the km-calc engine and the board settlement
// key their rows by it, the api validates path params with it, and the web
// builds the limits calendar (`isoWeeksOfYear`, grouped by `thursdayMonth`) and
// the breakdown labels from it (docs/14 §18.12).
//
// TIME-ZONE INDEPENDENT: dates go in and come out as `YYYY-MM-DD` strings and
// all arithmetic is integer day numbers (`civil-date.ts`) — no `Date`, so the
// result never depends on the process `TZ`. Invalid input yields `null`, never
// a throw.

import {
  civilFromDayNumber,
  dayNumberFromCivil,
  dayNumberFromIso,
  formatIsoWeekKeyRaw,
  isLeapYear,
  isoFromDayNumber,
  isoWeekOfDayNumber,
  isoWeekdayOfDayNumber,
  mondayDayNumberOfIsoWeek,
} from './civil-date';

/** An ISO week: the ISO year it belongs to and its number in that year. */
export interface IsoWeekRef {
  /** ISO year — the calendar year of the week's Thursday. */
  isoYear: number;
  /** 1..52, or 1..53 in a 53-week year. */
  isoWeek: number;
}

/** One ISO week with everything a calendar / breakdown row needs to render it. */
export interface IsoWeekInfo extends IsoWeekRef {
  /** `YYYY-Www`. */
  key: string;
  /** Monday, `YYYY-MM-DD` (may lie in the previous calendar year for W01). */
  start: string;
  /** Sunday, `YYYY-MM-DD` (may lie in the next calendar year for W52/W53). */
  end: string;
  /**
   * Calendar month (1..12) of the week's Thursday — the month the week belongs
   * to. The web limits calendar groups weeks by it (docs/14 §18): W01 2026 sits
   * in January although it starts on 29.12.2025.
   */
  thursdayMonth: number;
}

/** Lowest / highest ISO year the helpers accept (4-digit keys). */
const MIN_ISO_YEAR = 1;
const MAX_ISO_YEAR = 9999;

const ISO_WEEK_KEY_RE = /^(\d{4})-W(\d{2})$/u;

/**
 * Number of ISO weeks in `isoYear`: 53 when 1 January is a Thursday, or a
 * Wednesday in a leap year; 52 otherwise. (2020, 2026, 2032 → 53; 2021, 2025,
 * 2027 → 52.)
 */
export function isoWeeksInYear(isoYear: number): 52 | 53 {
  const jan1 = isoWeekdayOfDayNumber(dayNumberFromCivil(isoYear, 1, 1));
  return jan1 === 4 || (jan1 === 3 && isLeapYear(isoYear)) ? 53 : 52;
}

/** `true` when `isoWeek` exists in `isoYear` (integers, 1 ≤ week ≤ 52/53). */
export function isValidIsoWeek(isoYear: number, isoWeek: number): boolean {
  return (
    Number.isInteger(isoYear) &&
    isoYear >= MIN_ISO_YEAR &&
    isoYear <= MAX_ISO_YEAR &&
    Number.isInteger(isoWeek) &&
    isoWeek >= 1 &&
    isoWeek <= isoWeeksInYear(isoYear)
  );
}

/**
 * `YYYY-Www` key of a week, or `null` when the week does not exist
 * (`formatIsoWeekKey(2027, 53)` → `null`: 2027 has 52 weeks).
 */
export function formatIsoWeekKey(isoYear: number, isoWeek: number): string | null {
  return isValidIsoWeek(isoYear, isoWeek)
    ? formatIsoWeekKeyRaw(isoYear, isoWeek)
    : null;
}

/**
 * Parse a strict `YYYY-Www` key (two-digit week). `null` on any other shape
 * (`2026-W5`, `2026W05`, `2026-w05`) or a week the year does not have
 * (`2027-W53`, `2026-W00`, `2026-W54`).
 */
export function parseIsoWeekKey(key: string | null | undefined): IsoWeekRef | null {
  if (typeof key !== 'string') return null;
  const match = ISO_WEEK_KEY_RE.exec(key);
  if (!match) return null;
  const isoYear = Number(match[1]);
  const isoWeek = Number(match[2]);
  return isValidIsoWeek(isoYear, isoWeek) ? { isoYear, isoWeek } : null;
}

/** ISO week of a `YYYY-MM-DD` date; `null` when the date is invalid. */
export function isoWeekOfDate(date: string | null | undefined): IsoWeekRef | null {
  const dayNumber = dayNumberFromIso(date);
  return dayNumber === null ? null : isoWeekOfDayNumber(dayNumber);
}

/** `YYYY-Www` key of the week containing a `YYYY-MM-DD` date; `null` when invalid. */
export function isoWeekKeyOfDate(date: string | null | undefined): string | null {
  const ref = isoWeekOfDate(date);
  return ref === null ? null : formatIsoWeekKeyRaw(ref.isoYear, ref.isoWeek);
}

/** Monday (`YYYY-MM-DD`) of a week; `null` when the week does not exist. */
export function isoWeekMonday(isoYear: number, isoWeek: number): string | null {
  return isValidIsoWeek(isoYear, isoWeek)
    ? isoFromDayNumber(mondayDayNumberOfIsoWeek(isoYear, isoWeek))
    : null;
}

/** Sunday (`YYYY-MM-DD`) of a week; `null` when the week does not exist. */
export function isoWeekSunday(isoYear: number, isoWeek: number): string | null {
  return isValidIsoWeek(isoYear, isoWeek)
    ? isoFromDayNumber(mondayDayNumberOfIsoWeek(isoYear, isoWeek) + 6)
    : null;
}

/**
 * Saturday (`YYYY-MM-DD`) of a week — the day `kmPerSaturday` of that week
 * pays for (docs/14 §18.12 «дата субботы»); `null` when the week does not exist.
 */
export function isoWeekSaturday(isoYear: number, isoWeek: number): string | null {
  return isValidIsoWeek(isoYear, isoWeek)
    ? isoFromDayNumber(mondayDayNumberOfIsoWeek(isoYear, isoWeek) + 5)
    : null;
}

/**
 * Calendar month (1..12) of the week's Thursday — the month the week belongs
 * to; `null` when the week does not exist.
 */
export function isoWeekThursdayMonth(isoYear: number, isoWeek: number): number | null {
  return isValidIsoWeek(isoYear, isoWeek)
    ? civilFromDayNumber(mondayDayNumberOfIsoWeek(isoYear, isoWeek) + 3).m
    : null;
}

function buildInfo(isoYear: number, isoWeek: number): IsoWeekInfo {
  const monday = mondayDayNumberOfIsoWeek(isoYear, isoWeek);
  return {
    isoYear,
    isoWeek,
    key: formatIsoWeekKeyRaw(isoYear, isoWeek),
    start: isoFromDayNumber(monday),
    end: isoFromDayNumber(monday + 6),
    thursdayMonth: civilFromDayNumber(monday + 3).m,
  };
}

/** Key, Monday, Sunday and Thursday month of one week; `null` when it does not exist. */
export function isoWeekInfo(isoYear: number, isoWeek: number): IsoWeekInfo | null {
  return isValidIsoWeek(isoYear, isoWeek) ? buildInfo(isoYear, isoWeek) : null;
}

/** {@link isoWeekInfo} addressed by a `YYYY-Www` key. */
export function isoWeekInfoOfKey(key: string | null | undefined): IsoWeekInfo | null {
  const ref = parseIsoWeekKey(key);
  return ref === null ? null : buildInfo(ref.isoYear, ref.isoWeek);
}

/**
 * Every week of an ISO year, ascending (52 or 53 entries). `[]` for a year
 * outside 1..9999 or a non-integer. This is what the web limits calendar
 * renders: `GET /limits?year=` returns only the weeks that have a row, the
 * rest are filled in from here.
 */
export function isoWeeksOfYear(isoYear: number): IsoWeekInfo[] {
  if (!isValidIsoWeek(isoYear, 1)) return [];
  const count = isoWeeksInYear(isoYear);
  const out: IsoWeekInfo[] = [];
  for (let week = 1; week <= count; week += 1) {
    out.push(buildInfo(isoYear, week));
  }
  return out;
}
