// The limits calendar as data (docs/14 §18.1, §18.4, §18.5.3, §18.6.1):
// 12 month rows × week tiles, a week standing in the row of its THURSDAY's
// month, four quarter bands — plus the keyboard moves and selection maths
// the grid needs. Everything is derived from `isoWeeksOfYear` (shared), so no
// week number is ever hard-coded: December 2027 has 5 tiles W48–W52, Q4 2032
// starts at W41, W53 exists only in 53-week years.
//
// Pure, framework-free, unit-tested (`calendarGrid.test.ts`).

import { isoWeeksOfYear, type IsoWeekInfo } from '@magguarantee/shared';

export interface CalendarMonth {
  /** 1..12. */
  month: number;
  /** ISO week numbers whose Thursday falls in this month (4 or 5), ascending. */
  weeks: number[];
}

export interface CalendarQuarter {
  /** 1..4. */
  quarter: number;
  months: CalendarMonth[];
  /** First / last ISO week of the quarter's months. */
  fromWeek: number;
  toWeek: number;
  /** Every week of the quarter, ascending. */
  weeks: number[];
}

export interface CalendarYear {
  isoYear: number;
  /** All 52/53 weeks, index `isoWeek − 1`. */
  weeks: IsoWeekInfo[];
  months: CalendarMonth[];
  quarters: CalendarQuarter[];
  /** 52 or 53. */
  lastWeek: number;
}

/** Group the ISO weeks of a year by their Thursday month and quarter. */
export function buildCalendarYear(isoYear: number): CalendarYear {
  const weeks = isoWeeksOfYear(isoYear);
  const months: CalendarMonth[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    weeks: [],
  }));
  for (const info of weeks) {
    months[info.thursdayMonth - 1]!.weeks.push(info.isoWeek);
  }
  const quarters: CalendarQuarter[] = [1, 2, 3, 4].map((quarter) => {
    const qMonths = months.slice((quarter - 1) * 3, quarter * 3);
    const qWeeks = qMonths.flatMap((m) => m.weeks);
    return {
      quarter,
      months: qMonths,
      fromWeek: qWeeks[0] ?? 0,
      toWeek: qWeeks[qWeeks.length - 1] ?? 0,
      weeks: qWeeks,
    };
  });
  return { isoYear, weeks, months, quarters, lastWeek: weeks.length };
}

/** Month row and slot (0-based) of a week; `null` for a week not in the year. */
export function weekPosition(
  calendar: CalendarYear,
  isoWeek: number,
): { monthIndex: number; slot: number } | null {
  for (let monthIndex = 0; monthIndex < calendar.months.length; monthIndex += 1) {
    const slot = calendar.months[monthIndex]!.weeks.indexOf(isoWeek);
    if (slot !== -1) return { monthIndex, slot };
  }
  return null;
}

/** Quarter (1..4) a week belongs to — by its Thursday month. */
export function quarterOfWeek(calendar: CalendarYear, isoWeek: number): number {
  const pos = weekPosition(calendar, isoWeek);
  return pos === null ? 1 : Math.floor(pos.monthIndex / 3) + 1;
}

// ── Keyboard moves (§18.5.3) ────────────────────────────────────────

export type GridMove =
  | 'prev'
  | 'next'
  | 'up'
  | 'down'
  | 'monthStart'
  | 'monthEnd'
  | 'yearStart'
  | 'yearEnd';

/**
 * Where the focus goes from `isoWeek`:
 *  • prev / next — linear, across month borders; stops at the year's edges;
 *  • up / down — the same slot in the previous / next month row, or that
 *    month's last week when it has no such slot (5th slot → a 4-week month);
 *    stays put in January / December;
 *  • monthStart / monthEnd — first / last week of the month row;
 *  • yearStart / yearEnd — W01 / the last week of the year.
 */
export function moveWeek(
  calendar: CalendarYear,
  isoWeek: number,
  move: GridMove,
): number {
  const last = calendar.lastWeek;
  if (last === 0) return isoWeek;
  switch (move) {
    case 'prev':
      return Math.max(1, isoWeek - 1);
    case 'next':
      return Math.min(last, isoWeek + 1);
    case 'yearStart':
      return 1;
    case 'yearEnd':
      return last;
    default:
      break;
  }
  const pos = weekPosition(calendar, isoWeek);
  if (pos === null) return isoWeek;
  const row = calendar.months[pos.monthIndex]!.weeks;
  if (move === 'monthStart') return row[0] ?? isoWeek;
  if (move === 'monthEnd') return row[row.length - 1] ?? isoWeek;
  const targetIndex = move === 'up' ? pos.monthIndex - 1 : pos.monthIndex + 1;
  const target = calendar.months[targetIndex];
  if (!target || target.weeks.length === 0) return isoWeek;
  return target.weeks[Math.min(pos.slot, target.weeks.length - 1)]!;
}

// ── Selection (§18.6.1) ─────────────────────────────────────────────

/** Sorted, de-duplicated copy. */
export function normalizeWeeks(weeks: Iterable<number>): number[] {
  return [...new Set(weeks)].sort((a, b) => a - b);
}

/** Inclusive range between two weeks; reversed bounds are swapped silently. */
export function weekRange(a: number, b: number): number[] {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const out: number[] = [];
  for (let w = lo; w <= hi; w += 1) out.push(w);
  return out;
}

/** Add the week when absent, remove it when present (Ctrl/⌘+click, Ctrl+Space). */
export function toggleWeek(selected: readonly number[], isoWeek: number): number[] {
  return selected.includes(isoWeek)
    ? selected.filter((w) => w !== isoWeek)
    : normalizeWeeks([...selected, isoWeek]);
}

/** `true` for a non-empty run without gaps (`10, 11, 12`). */
export function isContiguous(weeks: readonly number[]): boolean {
  const sorted = normalizeWeeks(weeks);
  if (sorted.length === 0) return false;
  return sorted[sorted.length - 1]! - sorted[0]! === sorted.length - 1;
}

/**
 * Compact week list for `selection.weeks`: `10–22`, `3, 7, 10–12`. Runs of
 * two are written out (`3, 4`), runs of three or more collapse with an en
 * dash — the same dash the date ranges use.
 */
export function compactWeekList(weeks: readonly number[]): string {
  const sorted = normalizeWeeks(weeks);
  const parts: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j]! + 1) j += 1;
    const start = sorted[i]!;
    const end = sorted[j]!;
    if (j - i >= 2) parts.push(`${start}–${end}`);
    else for (let k = i; k <= j; k += 1) parts.push(String(sorted[k]));
    i = j + 1;
  }
  return parts.join(', ');
}

/**
 * Parse an «Od tyg. / do» field: an integer clamped into `1..lastWeek`;
 * `null` for anything that is not a whole number.
 */
export function parseWeekNumber(raw: string, lastWeek: number): number | null {
  const trimmed = raw.trim();
  if (!/^\d{1,3}$/u.test(trimmed)) return null;
  const n = Number(trimmed);
  return Math.min(Math.max(n, 1), lastWeek);
}
