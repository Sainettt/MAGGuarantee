// The limits calendar layout — every week number comes from `isoWeeksOfYear`,
// never hard-coded (docs/14 §18.4, §18.14).

import { describe, expect, it } from 'vitest';

import {
  buildCalendarYear,
  compactWeekList,
  isContiguous,
  moveWeek,
  normalizeWeeks,
  parseWeekNumber,
  quarterOfWeek,
  toggleWeek,
  weekPosition,
  weekRange,
} from './calendarGrid';

describe('buildCalendarYear — weeks by the month of their Thursday', () => {
  it('2026: 53 weeks, W01 in January, W53 the fifth tile of December', () => {
    const cal = buildCalendarYear(2026);
    expect(cal.lastWeek).toBe(53);
    expect(cal.months).toHaveLength(12);
    expect(cal.months[0]!.weeks[0]).toBe(1);
    expect(cal.weeks[0]!.start).toBe('2025-12-29');
    expect(cal.months[11]!.weeks).toEqual([49, 50, 51, 52, 53]);
    expect(cal.weeks[52]!.end).toBe('2027-01-03');
  });

  it('every week sits in exactly one month row; 4 or 5 tiles per month', () => {
    for (const year of [2025, 2026, 2027, 2032]) {
      const cal = buildCalendarYear(year);
      const all = cal.months.flatMap((m) => m.weeks);
      expect(all).toEqual(cal.weeks.map((w) => w.isoWeek));
      for (const m of cal.months) {
        expect(m.weeks.length === 4 || m.weeks.length === 5).toBe(true);
      }
    }
  });

  it('Q4 2026 reads «tyg. 40–53»', () => {
    const q4 = buildCalendarYear(2026).quarters[3]!;
    expect(q4.fromWeek).toBe(40);
    expect(q4.toWeek).toBe(53);
  });

  it('December 2027 (52-week year) still has 5 tiles W48–W52', () => {
    const cal = buildCalendarYear(2027);
    expect(cal.lastWeek).toBe(52);
    expect(cal.months[11]!.weeks).toEqual([48, 49, 50, 51, 52]);
  });

  it('Q4 2032 starts at W41, not W40', () => {
    const q4 = buildCalendarYear(2032).quarters[3]!;
    expect(q4.fromWeek).toBe(41);
    expect(q4.toWeek).toBe(53);
  });

  it('quarters partition the year', () => {
    const cal = buildCalendarYear(2026);
    expect(cal.quarters.flatMap((q) => q.weeks)).toHaveLength(53);
    expect(cal.quarters[0]!.fromWeek).toBe(1);
    expect(quarterOfWeek(cal, 14)).toBe(2);
    expect(quarterOfWeek(cal, 53)).toBe(4);
  });
});

describe('moveWeek — keyboard moves (§18.5.3)', () => {
  const cal = buildCalendarYear(2026);

  it('← / → are linear and stop at the year edges', () => {
    expect(moveWeek(cal, 5, 'next')).toBe(6);
    expect(moveWeek(cal, 6, 'prev')).toBe(5);
    expect(moveWeek(cal, 1, 'prev')).toBe(1);
    expect(moveWeek(cal, 53, 'next')).toBe(53);
  });

  it('↑ / ↓ keep the slot; a missing 5th slot falls back to the last week', () => {
    // January 2026: W1–W5 (5 Thursdays); February: W6–W9 (4).
    expect(cal.months[0]!.weeks).toEqual([1, 2, 3, 4, 5]);
    expect(cal.months[1]!.weeks).toEqual([6, 7, 8, 9]);
    expect(moveWeek(cal, 2, 'down')).toBe(7);
    expect(moveWeek(cal, 5, 'down')).toBe(9);
    expect(moveWeek(cal, 7, 'up')).toBe(2);
    expect(moveWeek(cal, 3, 'up')).toBe(3); // January has no row above
    expect(moveWeek(cal, 53, 'down')).toBe(53);
  });

  it('Home / End and Ctrl+Home / End', () => {
    expect(moveWeek(cal, 8, 'monthStart')).toBe(6);
    expect(moveWeek(cal, 7, 'monthEnd')).toBe(9);
    expect(moveWeek(cal, 30, 'yearStart')).toBe(1);
    expect(moveWeek(cal, 30, 'yearEnd')).toBe(53);
    expect(moveWeek(buildCalendarYear(2027), 30, 'yearEnd')).toBe(52);
  });

  it('weekPosition finds the row and slot', () => {
    expect(weekPosition(cal, 7)).toEqual({ monthIndex: 1, slot: 1 });
    expect(weekPosition(cal, 99)).toBeNull();
  });
});

describe('selection helpers (§18.6.1)', () => {
  it('range swaps reversed bounds silently', () => {
    expect(weekRange(12, 10)).toEqual([10, 11, 12]);
    expect(weekRange(4, 4)).toEqual([4]);
  });

  it('toggle adds / removes and keeps the list sorted', () => {
    expect(toggleWeek([3, 10], 7)).toEqual([3, 7, 10]);
    expect(toggleWeek([3, 7, 10], 7)).toEqual([3, 10]);
    expect(normalizeWeeks([5, 1, 5])).toEqual([1, 5]);
  });

  it('compact list: runs of 3+ collapse, pairs are written out', () => {
    expect(compactWeekList(weekRange(10, 22))).toBe('10–22');
    expect(compactWeekList([3, 7, 10, 11, 12])).toBe('3, 7, 10–12');
    expect(compactWeekList([3, 4])).toBe('3, 4');
    expect(compactWeekList([])).toBe('');
  });

  it('contiguity', () => {
    expect(isContiguous([10, 11, 12])).toBe(true);
    expect(isContiguous([10, 12])).toBe(false);
    expect(isContiguous([])).toBe(false);
  });

  it('«Od tyg. / do» fields clamp into the year and reject non-numbers', () => {
    expect(parseWeekNumber('10', 53)).toBe(10);
    expect(parseWeekNumber('0', 53)).toBe(1);
    expect(parseWeekNumber('60', 52)).toBe(52);
    expect(parseWeekNumber('', 53)).toBeNull();
    expect(parseWeekNumber('1.5', 53)).toBeNull();
  });
});
