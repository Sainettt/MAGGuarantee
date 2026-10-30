// Labels of an ISO week for the claim breakdown and the recalc dialog
// (docs/14 §18.7.1, §18.8, §18.9) — «Tydz. 23 · 03.06–07.06».
//
// The week is addressed by its `YYYY-Www` key; the Monday / Sunday and the ISO
// year come from the shared ISO-week helper (`isoWeekInfoOfKey`), the same one
// the km-calc engine keys its rows with, so the label and the engine can never
// disagree about which days a week has.
//
// Formats (§18.9):
//   • short date — `Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit' })`
//     → PL `03.06`, EN (en-GB) `03/06`; a date outside the week's ISO year also
//     carries the year (`29.12.2025` in 2026-W01, `03.01.2027` in 2026-W53);
//   • long range — `{ day: 'numeric', month: 'long', year: 'numeric' }` with
//     `formatRange` → «3–7 czerwca 2026» (for screen-reader / aria texts).
//
// `YYYY-MM-DD` is parsed as a LOCAL calendar day (`new Date(y, m − 1, d)`),
// never through UTC — `new Date('2026-06-03')` is UTC midnight and shows as
// 02.06 west of Greenwich. Like `month.ts` next to it, nothing here reads the
// clock. Pure, unit-tested (`weekLabel.test.ts`).

import { isoWeekInfoOfKey } from '@magguarantee/shared';

/** The BCP 47 tag the app formats dates with: `pl` → `pl-PL`, anything else → `en-GB`. */
export function intlLocaleTag(locale: string): 'pl-PL' | 'en-GB' {
  return locale === 'pl' ? 'pl-PL' : 'en-GB';
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/u;

/**
 * `YYYY-MM-DD` → the local-midnight `Date` of that calendar day; `null` when
 * the string is not a real date (`2026-02-30`, `garbage`).
 */
export function parseLocalIsoDate(iso: string): Date | null {
  const match = ISO_DATE_RE.exec(iso);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const date = new Date(y, m - 1, d);
  // `new Date` rolls 30.02 over to 02.03 — reject instead of mislabelling.
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return null;
  }
  return date;
}

/**
 * Short day label: `03.06` (pl) / `03/06` (en). With `contextYear` given, a date
 * whose calendar year differs carries the year (`29.12.2025`). An unparseable
 * input is echoed rather than rendered as «Invalid Date».
 */
export function formatWeekDate(
  iso: string,
  locale: string,
  contextYear?: number,
): string {
  const date = parseLocalIsoDate(iso);
  if (!date) return iso;
  const withYear = contextYear !== undefined && date.getFullYear() !== contextYear;
  return new Intl.DateTimeFormat(intlLocaleTag(locale), {
    day: '2-digit',
    month: '2-digit',
    ...(withYear ? { year: 'numeric' as const } : {}),
  }).format(date);
}

/**
 * Short range whose END always carries its year, the start only when its year
 * differs: `01.06–07.06.2026`, `29.12.2025–04.01.2026` (the limits panel
 * heading, docs/14 §18.5.1 «дата с годом»). Parsed as local calendar days.
 */
export function formatRangeWithYear(
  fromIso: string,
  toIso: string,
  locale: string,
): string {
  const to = parseLocalIsoDate(toIso);
  if (!to) return `${fromIso}–${toIso}`;
  return `${formatWeekDate(fromIso, locale, to.getFullYear())}–${formatDateWithYear(toIso, locale)}`;
}

/** `03.01.2027` (pl) / `03/01/2027` (en); garbage is echoed. */
export function formatDateWithYear(iso: string, locale: string): string {
  const date = parseLocalIsoDate(iso);
  if (!date) return iso;
  return new Intl.DateTimeFormat(intlLocaleTag(locale), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

const LONG_DATE: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
};

/** Long single date: «3 czerwca 2026» / «3 June 2026». */
export function formatLongDate(iso: string, locale: string): string {
  const date = parseLocalIsoDate(iso);
  if (!date) return iso;
  return new Intl.DateTimeFormat(intlLocaleTag(locale), LONG_DATE).format(date);
}

/**
 * Long range for aria / screen-reader texts: «3–7 czerwca 2026», «29 grudnia
 * 2025 – 4 stycznia 2026». A one-day range collapses to the single date.
 */
export function formatLongDateRange(
  fromIso: string,
  toIso: string,
  locale: string,
): string {
  const from = parseLocalIsoDate(fromIso);
  const to = parseLocalIsoDate(toIso);
  if (!from || !to) return `${fromIso}–${toIso}`;
  const format = new Intl.DateTimeFormat(intlLocaleTag(locale), LONG_DATE);
  return fromIso === toIso ? format.format(from) : format.formatRange(from, to);
}

/** Everything a week label needs, pre-formatted for the ICU messages. */
export interface IsoWeekLabelParts {
  /** ISO week number, 1..53. */
  week: number;
  /** ISO year of the week (the year of its Thursday). */
  isoYear: number;
  /** First day of the week inside the claim period, short (`03.06`). */
  from: string;
  /** Last day of the week inside the claim period, short. */
  to: string;
  /** The week's part of the period is a single day — label it with one date. */
  singleDay: boolean;
  /** The period does not cover the full Monday–Sunday week. */
  clipped: boolean;
  /** Monday of the full week, short. */
  fullFrom: string;
  /** Sunday of the full week, short. */
  fullTo: string;
}

/**
 * Label parts of one week of a claim. The visible range is CLIPPED to the
 * claim period (a carrier thinks in departure dates, §18.7.1); the full week is
 * carried separately for the `title` / sr-only «Pełny tydzień: …». `null` when
 * the key is not a valid `YYYY-Www` (the caller then shows the raw key).
 */
export function isoWeekLabelParts(
  input: { isoWeek: string; periodStart: string; periodEnd: string },
  locale: string,
): IsoWeekLabelParts | null {
  const info = isoWeekInfoOfKey(input.isoWeek);
  if (!info) return null;
  const year = info.isoYear;
  return {
    week: info.isoWeek,
    isoYear: year,
    from: formatWeekDate(input.periodStart, locale, year),
    to: formatWeekDate(input.periodEnd, locale, year),
    singleDay: input.periodStart === input.periodEnd,
    clipped: input.periodStart !== info.start || input.periodEnd !== info.end,
    fullFrom: formatWeekDate(info.start, locale, year),
    fullTo: formatWeekDate(info.end, locale, year),
  };
}
